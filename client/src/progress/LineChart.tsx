import { KeyboardEvent, PointerEvent, useId, useRef, useState } from "react";

// A single-series weekly line chart in plain SVG. One series, so the title names it and there's no legend.
// Weeks with no data leave a gap in the line. Hover (or focus and the arrow keys) moves a crosshair that snaps to the
// nearest week and shows its value; every value is also in the page's table, so the tooltip never gates anything.
const W = 320;
const H = 150;
const M = { top: 12, right: 12, bottom: 24, left: 34 };
const PW = W - M.left - M.right;
const PH = H - M.top - M.bottom;

export function LineChart({
  values,
  labels,
  yMax,
  format,
  summary,
}: {
  values: (number | null)[];
  labels: string[];
  yMax: number;
  format: (v: number) => string;
  summary: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tipId = useId();
  const n = values.length;
  const x = (i: number) => M.left + (n === 1 ? PW / 2 : (i / (n - 1)) * PW);
  const y = (v: number) => M.top + PH - (Math.min(v, yMax) / yMax) * PH;

  // Break the line where a week has no data.
  const segments: string[] = [];
  let current = "";
  values.forEach((v, i) => {
    if (v == null) {
      if (current) segments.push(current);
      current = "";
      return;
    }
    current += `${current ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
  });
  if (current) segments.push(current);

  const ticks = [0, yMax / 2, yMax];
  const labelAt = [0, Math.floor((n - 1) / 2), n - 1];

  function nearest(e: PointerEvent<SVGSVGElement>) {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return;
    const px = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    setActive(best);
  }

  function onKey(e: KeyboardEvent<SVGSVGElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    setActive((a) => {
      if (e.key === "Home") return 0;
      if (e.key === "End") return n - 1;
      const from = a ?? n - 1;
      return Math.max(0, Math.min(n - 1, from + (e.key === "ArrowLeft" ? -1 : 1)));
    });
  }

  const activeValue = active != null ? values[active] : null;
  const tip = active != null ? `Week of ${labels[active]}: ${activeValue == null ? "no practice" : format(activeValue)}` : "";

  return (
    <div className="line-chart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${summary} Use the left and right arrow keys to read each week.`}
        aria-describedby={tip ? tipId : undefined}
        tabIndex={0}
        onPointerMove={nearest}
        onPointerLeave={() => setActive(null)}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} className="lc-grid" />
            <text x={M.left - 6} y={y(t) + 4} className="lc-axis" textAnchor="end">
              {/* Just the number: the unit is in the chart's title and note. */}
              {Math.round(t * 10) / 10}
            </text>
          </g>
        ))}
        {labelAt.map((i) => (
          <text key={i} x={x(i)} y={H - 6} className="lc-axis" textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>
            {labels[i]}
          </text>
        ))}
        {segments.map((d, i) => (
          <path key={i} d={d} className="lc-line" />
        ))}
        {active != null && <line x1={x(active)} x2={x(active)} y1={M.top} y2={M.top + PH} className="lc-cross" />}
        {values.map((v, i) => (v == null ? null : <circle key={i} cx={x(i)} cy={y(v)} r={i === active ? 5 : 4} className="lc-dot" />))}
      </svg>
      {active != null && (
        <div
          className="lc-tip"
          // Anchored inward at the ends so the tip never hangs off the chart (and the page) on a phone.
          style={{ left: `${(x(active) / W) * 100}%`, transform: active < n / 4 ? "translateX(-15%)" : active > (3 * n) / 4 ? "translateX(-85%)" : "translateX(-50%)" }}
          aria-hidden="true"
        >
          <strong>{labels[active]}</strong> {activeValue == null ? "no practice" : format(activeValue)}
        </div>
      )}
      <span id={tipId} className="visually-hidden" aria-live="polite">
        {tip}
      </span>
    </div>
  );
}
