// The weekly goal as a ring of segments, one per practice day needed; each day practised fills one. The number
// in the middle and the label carry the same information as text.
export function WeekRing({ practised, goal }: { practised: number; goal: number }) {
  const size = 64;
  const r = 26;
  const c = size / 2;
  const gap = 0.16; // radians between segments
  const filled = Math.min(practised, goal);
  const arc = (i: number) => {
    const start = -Math.PI / 2 + (i * 2 * Math.PI) / goal + gap / 2;
    const end = -Math.PI / 2 + ((i + 1) * 2 * Math.PI) / goal - gap / 2;
    const p = (a: number) => `${(c + r * Math.cos(a)).toFixed(2)},${(c + r * Math.sin(a)).toFixed(2)}`;
    return `M${p(start)} A${r},${r} 0 0 1 ${p(end)}`;
  };
  return (
    <svg className="week-ring" viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`${practised} of ${goal} practice days this week`}>
      {Array.from({ length: goal }, (_, i) => (
        <path key={i} d={arc(i)} className={i < filled ? "week-ring-on" : "week-ring-off"} />
      ))}
      <text x={c} y={c + 5} textAnchor="middle" className="week-ring-text" aria-hidden="true">
        {practised}/{goal}
      </text>
    </svg>
  );
}
