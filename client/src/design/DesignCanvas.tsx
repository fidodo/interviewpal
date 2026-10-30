import { FormEvent, KeyboardEvent, PointerEvent, useId, useMemo, useRef, useState } from "react";
import { COMPONENT_KINDS, ComponentKind, Diagram, DiagramEdge, DiagramNode, KIND_GROUP, MAX_EDGES, MAX_LABEL, MAX_NODES, nodeName } from "./kinds";

const WIDTH = 960;
const HEIGHT = 600;
const NODE_W = 132;
const NODE_H = 56;
const STEP = 10;
const BIG_STEP = 40;

type Selection = { type: "node" | "edge"; id: string } | null;

let idCounter = 0;
const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(idCounter++).toString(36)}`;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const short = (text: string, max = 17) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

// The point where the line from a node's centre towards (tx, ty) leaves its box, so arrows stop at the edge.
function boxExit(n: DiagramNode, tx: number, ty: number) {
  const cx = n.x + NODE_W / 2;
  const cy = n.y + NODE_H / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const t = Math.min(dx === 0 ? Infinity : NODE_W / 2 / Math.abs(dx), dy === 0 ? Infinity : NODE_H / 2 / Math.abs(dy));
  return { x: cx + dx * t, y: cy + dy * t };
}

function edgeLine(from: DiagramNode, to: DiagramNode) {
  const a = boxExit(from, to.x + NODE_W / 2, to.y + NODE_H / 2);
  const b = boxExit(to, from.x + NODE_W / 2, from.y + NODE_H / 2);
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

// The next free-ish slot for a new component: a grid that fills left to right.
function nextSlot(count: number) {
  // Gaps wide enough for a connection label between neighbours.
  const perRow = 5;
  const col = count % perRow;
  const row = Math.floor(count / perRow) % 6;
  return { x: 24 + col * 184, y: 24 + row * 96 };
}

// The canvas, read-only: used on the result page. The viewBox fits the drawing.
export function DiagramView({ diagram, label }: { diagram: Diagram; label: string }) {
  const byId = new Map(diagram.nodes.map((n) => [n.id, n]));
  const xs = diagram.nodes.map((n) => n.x);
  const ys = diagram.nodes.map((n) => n.y);
  const minX = Math.min(...xs) - 24;
  const minY = Math.min(...ys) - 24;
  const w = Math.max(...xs) + NODE_W + 24 - minX;
  const h = Math.max(...ys) + NODE_H + 24 - minY;
  const markerId = useId().replace(/:/g, "");
  if (diagram.nodes.length === 0) return <p className="helper-text">No diagram was drawn.</p>;
  return (
    <svg className="dg-svg dg-svg-view" viewBox={`${minX} ${minY} ${w} ${h}`} role="img" aria-label={label}>
      <ArrowMarker id={markerId} />
      {diagram.edges.map((e) => {
        const from = byId.get(e.from);
        const to = byId.get(e.to);
        return from && to ? <EdgeShape key={e.id} edge={e} from={from} to={to} markerId={markerId} /> : null;
      })}
      {diagram.nodes.map((n) => (
        <NodeShape key={n.id} node={n} />
      ))}
    </svg>
  );
}

function ArrowMarker({ id }: { id: string }) {
  return (
    <defs>
      <marker id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" className="dg-arrow" />
      </marker>
    </defs>
  );
}

function EdgeShape({ edge, from, to, markerId, selected }: { edge: DiagramEdge; from: DiagramNode; to: DiagramNode; markerId: string; selected?: boolean }) {
  const line = edgeLine(from, to);
  const mx = (line.x1 + line.x2) / 2;
  const my = (line.y1 + line.y2) / 2;
  return (
    <g className={`dg-edge ${selected ? "is-selected" : ""}`}>
      <line {...line} className="dg-edge-line" markerEnd={`url(#${markerId})`} />
      {edge.label && (
        <text x={mx} y={my - 6} className="dg-edge-label" textAnchor="middle">
          {short(edge.label, 24)}
        </text>
      )}
    </g>
  );
}

function NodeShape({ node, selected, connecting }: { node: DiagramNode; selected?: boolean; connecting?: boolean }) {
  return (
    <g className={`dg-node dg-node--${KIND_GROUP[node.kind]} ${selected ? "is-selected" : ""} ${connecting ? "is-connecting" : ""}`} transform={`translate(${node.x} ${node.y})`}>
      <rect width={NODE_W} height={NODE_H} rx={node.kind === "database" ? 18 : 10} className="dg-node-box" />
      <text x={10} y={18} className="dg-node-kind">
        {COMPONENT_KINDS[node.kind]}
      </text>
      <text x={10} y={40} className="dg-node-label">
        {short(nodeName(node))}
      </text>
    </g>
  );
}

interface DesignCanvasProps {
  diagram: Diagram;
  onChange: (next: Diagram) => void;
  labelledBy: string;
  disabled?: boolean;
}

// An editable system design diagram. Components are dragged with a pointer or moved with the arrow keys; connections
// are made by picking a component and then its target (on the canvas or from a list). Everything on the canvas can
// also be done from the panel below it, which is what keyboard and screen-reader users get.
export function DesignCanvas({ diagram, onChange, labelledBy, disabled }: DesignCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number; pointerId: number } | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [newKind, setNewKind] = useState<ComponentKind>("service");
  const [newLabel, setNewLabel] = useState("");
  const [connectTo, setConnectTo] = useState("");
  const [connectLabel, setConnectLabel] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const uid = useId().replace(/:/g, "");
  const markerId = `dg-arrow-${uid}`;

  const byId = useMemo(() => new Map(diagram.nodes.map((n) => [n.id, n])), [diagram.nodes]);
  const selectedNode = selection?.type === "node" ? byId.get(selection.id) ?? null : null;
  const selectedEdge = selection?.type === "edge" ? diagram.edges.find((e) => e.id === selection.id) ?? null : null;

  function select(next: Selection) {
    setSelection(next);
    setConnectTo("");
    setConnectLabel("");
  }

  function addNode(e: FormEvent) {
    e.preventDefault();
    if (diagram.nodes.length >= MAX_NODES) return setAnnouncement(`You can have up to ${MAX_NODES} components.`);
    const node: DiagramNode = { id: newId("n"), kind: newKind, label: newLabel.trim(), ...nextSlot(diagram.nodes.length) };
    onChange({ ...diagram, nodes: [...diagram.nodes, node] });
    setNewLabel("");
    select({ type: "node", id: node.id });
    setAnnouncement(`Added ${nodeName(node)}.`);
  }

  function updateNode(id: string, patch: Partial<DiagramNode>) {
    onChange({ ...diagram, nodes: diagram.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) });
  }

  function removeNode(id: string) {
    const node = byId.get(id);
    onChange({ nodes: diagram.nodes.filter((n) => n.id !== id), edges: diagram.edges.filter((e) => e.from !== id && e.to !== id) });
    if (connectFrom === id) setConnectFrom(null);
    select(null);
    if (node) setAnnouncement(`Removed ${nodeName(node)} and its connections.`);
  }

  function addEdge(from: string, to: string, label: string) {
    const a = byId.get(from);
    const b = byId.get(to);
    if (!a || !b || from === to) return;
    if (diagram.edges.some((e) => e.from === from && e.to === to)) return setAnnouncement(`${nodeName(a)} already connects to ${nodeName(b)}.`);
    if (diagram.edges.length >= MAX_EDGES) return setAnnouncement(`You can have up to ${MAX_EDGES} connections.`);
    const edge: DiagramEdge = { id: newId("e"), from, to, label: label.trim().slice(0, MAX_LABEL) };
    onChange({ ...diagram, edges: [...diagram.edges, edge] });
    setAnnouncement(`Connected ${nodeName(a)} to ${nodeName(b)}.`);
    select({ type: "edge", id: edge.id });
  }

  function updateEdge(id: string, patch: Partial<DiagramEdge>) {
    onChange({ ...diagram, edges: diagram.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  }

  function removeEdge(id: string) {
    onChange({ ...diagram, edges: diagram.edges.filter((e) => e.id !== id) });
    select(null);
    setAnnouncement("Connection removed.");
  }

  // Picking a component: finishes a connection in progress, otherwise selects it.
  function pick(id: string) {
    if (connectFrom && connectFrom !== id) {
      addEdge(connectFrom, id, "");
      setConnectFrom(null);
      return true;
    }
    if (connectFrom === id) {
      setConnectFrom(null);
      setAnnouncement("Connecting cancelled.");
    }
    select({ type: "node", id });
    return false;
  }

  function startConnecting(id: string) {
    setConnectFrom(id);
    const node = byId.get(id);
    setAnnouncement(`Connecting from ${node ? nodeName(node) : "this component"}. Now pick the component it sends to, or press Escape.`);
  }

  function toSvgPoint(clientX: number, clientY: number) {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  function onNodePointerDown(e: PointerEvent<SVGGElement>, node: DiagramNode) {
    if (disabled || e.button !== 0) return;
    e.stopPropagation();
    if (pick(node.id)) return;
    const p = toSvgPoint(e.clientX, e.clientY);
    drag.current = { id: node.id, dx: p.x - node.x, dy: p.y - node.y, pointerId: e.pointerId };
    svgRef.current?.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (disabled) {
      drag.current = null;
      return;
    }
    const p = toSvgPoint(e.clientX, e.clientY);
    updateNode(d.id, { x: Math.round(clamp(p.x - d.dx, 0, WIDTH - NODE_W)), y: Math.round(clamp(p.y - d.dy, 0, HEIGHT - NODE_H)) });
  }

  function endDrag(e: PointerEvent<SVGSVGElement>) {
    if (drag.current?.pointerId === e.pointerId) drag.current = null;
  }

  function onNodeKeyDown(e: KeyboardEvent<SVGGElement>, node: DiagramNode) {
    if (disabled) return;
    const step = e.shiftKey ? BIG_STEP : STEP;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      const [dx, dy] = moves[e.key];
      updateNode(node.id, { x: clamp(node.x + dx, 0, WIDTH - NODE_W), y: clamp(node.y + dy, 0, HEIGHT - NODE_H) });
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(node.id);
    } else if (e.key === "c" || e.key === "C") {
      e.preventDefault();
      startConnecting(node.id);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      removeNode(node.id);
    } else if (e.key === "Escape" && connectFrom) {
      setConnectFrom(null);
      setAnnouncement("Connecting cancelled.");
    }
  }

  const connections = (id: string) => diagram.edges.filter((e) => e.from === id || e.to === id).length;
  const connectingNode = connectFrom ? byId.get(connectFrom) : null;

  return (
    <div className="dg">
      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>
      {connectingNode && (
        <p className="dg-banner" role="status">
          Connecting from <strong>{nodeName(connectingNode)}</strong>: tap the component it sends to.{" "}
          <button type="button" className="btn-link btn-link-inline" onClick={() => setConnectFrom(null)}>
            Cancel
          </button>
        </p>
      )}
      <div className="dg-scroll">
        <svg
          ref={svgRef}
          className="dg-svg"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="group"
          aria-labelledby={labelledBy}
          aria-describedby={`${uid}-help`}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerDown={() => {
            if (connectFrom) setConnectFrom(null);
            select(null);
          }}
        >
          <ArrowMarker id={markerId} />
          <rect width={WIDTH} height={HEIGHT} className="dg-bg" />
          {diagram.edges.map((edge) => {
            const from = byId.get(edge.from);
            const to = byId.get(edge.to);
            if (!from || !to) return null;
            const line = edgeLine(from, to);
            return (
              <g
                key={edge.id}
                onPointerDown={(e) => {
                  if (disabled) return;
                  e.stopPropagation();
                  setConnectFrom(null);
                  select({ type: "edge", id: edge.id });
                }}
              >
                {/* A wide invisible line makes the connection easy to tap. */}
                <line {...line} className="dg-edge-hit" />
                <EdgeShape edge={edge} from={from} to={to} markerId={markerId} selected={selection?.id === edge.id} />
              </g>
            );
          })}
          {diagram.nodes.map((node) => (
            <g
              key={node.id}
              role="button"
              tabIndex={disabled ? -1 : 0}
              aria-pressed={selection?.id === node.id}
              aria-label={`${COMPONENT_KINDS[node.kind]}: ${nodeName(node)}, ${connections(node.id)} connection${connections(node.id) === 1 ? "" : "s"}`}
              className="dg-node-wrap"
              onPointerDown={(e) => onNodePointerDown(e, node)}
              onKeyDown={(e) => onNodeKeyDown(e, node)}
            >
              <title>{`${COMPONENT_KINDS[node.kind]}: ${nodeName(node)}`}</title>
              <NodeShape node={node} selected={selection?.id === node.id} connecting={connectFrom === node.id} />
            </g>
          ))}
          {diagram.nodes.length === 0 && (
            <text x={WIDTH / 2} y={HEIGHT / 2} className="dg-empty" textAnchor="middle">
              Add components below, then drag them into place and connect them.
            </text>
          )}
        </svg>
      </div>
      <p id={`${uid}-help`} className="helper-text">
        Drag components to move them. Select one, then <em>Connect</em> and pick its target. With a keyboard: Tab to a component, arrow keys move it
        (Shift for bigger steps), C starts a connection, Enter picks, Delete removes.
      </p>

      <div className="dg-panel">
        <form className="dg-add" onSubmit={addNode}>
          <h3 className="dg-panel-title">Add a component</h3>
          <div className="dg-row">
            <div className="field">
              <label htmlFor={`${uid}-kind`}>Type</label>
              <select id={`${uid}-kind`} className="input" value={newKind} onChange={(e) => setNewKind(e.target.value as ComponentKind)} disabled={disabled}>
                {Object.entries(COMPONENT_KINDS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${uid}-label`}>Name (optional)</label>
              <input
                id={`${uid}-label`}
                className="input"
                maxLength={MAX_LABEL}
                placeholder={newKind === "database" ? "e.g. Users (Postgres)" : "e.g. Upload service"}
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                disabled={disabled}
              />
            </div>
          </div>
          <button type="submit" className="btn btn-secondary" disabled={disabled || diagram.nodes.length >= MAX_NODES}>
            + Add component
          </button>
        </form>

        {selectedNode && (
          <section className="dg-selected" aria-label="Selected component">
            <h3 className="dg-panel-title">Selected: {nodeName(selectedNode)}</h3>
            <div className="dg-row">
              <div className="field">
                <label htmlFor={`${uid}-sel-label`}>Name</label>
                <input
                  id={`${uid}-sel-label`}
                  className="input"
                  maxLength={MAX_LABEL}
                  value={selectedNode.label}
                  onChange={(e) => updateNode(selectedNode.id, { label: e.target.value })}
                  disabled={disabled}
                />
              </div>
              <div className="field">
                <label htmlFor={`${uid}-sel-kind`}>Type</label>
                <select
                  id={`${uid}-sel-kind`}
                  className="input"
                  value={selectedNode.kind}
                  onChange={(e) => updateNode(selectedNode.id, { kind: e.target.value as ComponentKind })}
                  disabled={disabled}
                >
                  {Object.entries(COMPONENT_KINDS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {diagram.nodes.length > 1 && (
              <form
                className="dg-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (connectTo) addEdge(selectedNode.id, connectTo, connectLabel);
                }}
              >
                <div className="field">
                  <label htmlFor={`${uid}-to`}>Sends to</label>
                  <select id={`${uid}-to`} className="input" value={connectTo} onChange={(e) => setConnectTo(e.target.value)} disabled={disabled}>
                    <option value="">Choose a component…</option>
                    {diagram.nodes
                      .filter((n) => n.id !== selectedNode.id)
                      .map((n) => (
                        <option key={n.id} value={n.id}>
                          {nodeName(n)} ({COMPONENT_KINDS[n.kind]})
                        </option>
                      ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={`${uid}-to-label`}>Label (optional)</label>
                  <input
                    id={`${uid}-to-label`}
                    className="input"
                    maxLength={MAX_LABEL}
                    placeholder="e.g. HTTPS, reads, publishes"
                    value={connectLabel}
                    onChange={(e) => setConnectLabel(e.target.value)}
                    disabled={disabled}
                  />
                </div>
                <button type="submit" className="btn btn-secondary dg-row-btn" disabled={disabled || !connectTo}>
                  Add connection
                </button>
              </form>
            )}
            <div className="dg-actions">
              {diagram.nodes.length > 1 && (
                <button type="button" className="btn btn-secondary" onClick={() => startConnecting(selectedNode.id)} disabled={disabled}>
                  Connect on the canvas
                </button>
              )}
              <button type="button" className="btn btn-danger" onClick={() => removeNode(selectedNode.id)} disabled={disabled}>
                Delete component
              </button>
            </div>
          </section>
        )}

        {selectedEdge && byId.get(selectedEdge.from) && byId.get(selectedEdge.to) && (
          <section className="dg-selected" aria-label="Selected connection">
            <h3 className="dg-panel-title">
              Selected: {nodeName(byId.get(selectedEdge.from)!)} → {nodeName(byId.get(selectedEdge.to)!)}
            </h3>
            <div className="field">
              <label htmlFor={`${uid}-edge-label`}>Label</label>
              <input
                id={`${uid}-edge-label`}
                className="input"
                maxLength={MAX_LABEL}
                placeholder="e.g. HTTPS, reads, publishes"
                value={selectedEdge.label}
                onChange={(e) => updateEdge(selectedEdge.id, { label: e.target.value })}
                disabled={disabled}
              />
            </div>
            <div className="dg-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => updateEdge(selectedEdge.id, { from: selectedEdge.to, to: selectedEdge.from })}
                disabled={disabled || diagram.edges.some((e) => e.from === selectedEdge.to && e.to === selectedEdge.from)}
              >
                Reverse direction
              </button>
              <button type="button" className="btn btn-danger" onClick={() => removeEdge(selectedEdge.id)} disabled={disabled}>
                Delete connection
              </button>
            </div>
          </section>
        )}

        {diagram.edges.length > 0 && (
          <details className="dg-list">
            <summary>
              All connections ({diagram.edges.length})
            </summary>
            <ul>
              {diagram.edges.map((e) => {
                const from = byId.get(e.from);
                const to = byId.get(e.to);
                if (!from || !to) return null;
                return (
                  <li key={e.id}>
                    <button type="button" className="btn-link btn-link-inline" onClick={() => select({ type: "edge", id: e.id })}>
                      {nodeName(from)} → {nodeName(to)}
                      {e.label ? `: ${e.label}` : ""}
                    </button>
                  </li>
                );
              })}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
