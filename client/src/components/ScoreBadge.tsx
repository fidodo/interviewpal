export function scoreClass(score: number): string {
  if (score >= 7) return "score-high";
  if (score >= 4) return "score-mid";
  return "score-low";
}

export function ScoreBadge({ score, animate }: { score: number; animate?: boolean }) {
  return (
    <div className={`score-badge ${scoreClass(score)} ${animate ? "score-pop" : ""}`} role="img" aria-label={`Score ${score} out of 10`}>
      <span aria-hidden="true">{score}</span>
    </div>
  );
}
