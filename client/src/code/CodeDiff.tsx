import { useId, useMemo, useState } from "react";
import { DiffItem, DiffRow, diffLines, diffStats, withContext } from "./diff";

export interface DiffView {
  key: string;
  // The segmented-control label, e.g. "Buggy code → fix".
  label: string;
  from: string;
  to: string;
  // Shown when the two texts match, e.g. "Your code matches the fix."
  sameText: string;
}

function Row({ row }: { row: DiffRow }) {
  const label = row.kind === "add" ? "Added line" : row.kind === "del" ? "Removed line" : null;
  const Mark = row.kind === "add" ? "ins" : row.kind === "del" ? "del" : "span";
  return (
    <div className={`diff-row diff-${row.kind}`}>
      <span className="diff-no" aria-hidden="true">
        {row.oldNo ?? ""}
      </span>
      <span className="diff-no" aria-hidden="true">
        {row.newNo ?? ""}
      </span>
      <span className="diff-mark" aria-hidden="true">
        {row.kind === "add" ? "+" : row.kind === "del" ? "−" : " "}
      </span>
      <span className="diff-text">
        {label && <span className="visually-hidden">{label}: </span>}
        {row.parts.map((p, i) =>
          p.changed ? (
            <Mark key={i} className="diff-word">
              {p.text}
            </Mark>
          ) : (
            <span key={i}>{p.text}</span>
          )
        )}
        {row.parts.every((p) => !p.text) && " "}
      </span>
    </div>
  );
}

// Shows what changed between two versions of some code: removed lines in red with "−", added lines in green with
// "+", and the exact words that changed inside an edited line highlighted more strongly. Several comparisons can be
// offered (e.g. the buggy code and your own code, each against the fix).
export function CodeDiff({ views, title }: { views: DiffView[]; title: string }) {
  const [active, setActive] = useState(views[0].key);
  const [onlyChanges, setOnlyChanges] = useState(false);
  const view = views.find((v) => v.key === active) ?? views[0];
  const rows = useMemo(() => diffLines(view.from, view.to), [view.from, view.to]);
  const stats = diffStats(rows);
  const items: DiffItem[] = onlyChanges ? withContext(rows) : rows.map((row) => ({ type: "row", row }));
  const headingId = useId();
  const summary = !stats.changed
    ? view.sameText
    : `${stats.lines} line${stats.lines === 1 ? "" : "s"} changed in ${stats.places} place${stats.places === 1 ? "" : "s"}.`;

  return (
    <section className="code-diff-wrap" aria-labelledby={headingId}>
      <div className="code-diff-head">
        <h3 id={headingId} className="feedback-list-title">
          {title}
        </h3>
        {views.length > 1 && (
          <div className="segmented" role="group" aria-label="Compare">
            {views.map((v) => (
              <button key={v.key} type="button" className={`segmented-option ${v.key === view.key ? "active" : ""}`} aria-pressed={v.key === view.key} onClick={() => setActive(v.key)}>
                {v.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="helper-text code-diff-summary" aria-live="polite">
        {views.length > 1 && `${view.label}: `}
        {summary} <span aria-hidden="true">Removed lines are marked −, added lines +.</span>
      </p>
      {stats.changed && (
        <label className="checkbox-row code-diff-toggle">
          <input type="checkbox" checked={onlyChanges} onChange={(e) => setOnlyChanges(e.target.checked)} />
          <span>Only show changed lines</span>
        </label>
      )}
      <div className="code-diff" role="region" aria-label={`${title}: ${view.label}`} tabIndex={0}>
        {items.map((item, i) =>
          item.type === "row" ? (
            <Row key={i} row={item.row} />
          ) : (
            <div key={i} className="diff-fold">
              {item.count} unchanged line{item.count === 1 ? "" : "s"}
            </div>
          )
        )}
      </div>
    </section>
  );
}
