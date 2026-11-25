// Numbered pages with Previous / Next. Long runs fold around the current page: 1 … 4 5 6 … 12.
// Renders nothing when everything fits on one page.
export function Pagination({ page, pages, onChange, label = "Pages" }: { page: number; pages: number; onChange: (page: number) => void; label?: string }) {
  if (pages <= 1) return null;
  return (
    <nav className="pagination" aria-label={label}>
      <button type="button" className="btn btn-secondary pagination-step" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <span aria-hidden="true">‹</span><span className="pagination-word"> Previous</span>
      </button>
      <ul className="pagination-pages">
        {pageList(page, pages).map((p, i) =>
          p === null ? (
            <li key={`gap-${i}`} className="pagination-gap" aria-hidden="true">
              …
            </li>
          ) : (
            <li key={p}>
              <button
                type="button"
                className={`pagination-page ${p === page ? "active" : ""}`}
                aria-current={p === page ? "page" : undefined}
                aria-label={`Page ${p}`}
                onClick={() => p !== page && onChange(p)}
              >
                {p}
              </button>
            </li>
          )
        )}
      </ul>
      <button type="button" className="btn btn-secondary pagination-step" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        <span className="pagination-word">Next </span><span aria-hidden="true">›</span>
      </button>
    </nav>
  );
}

// The page numbers to show: always the first and last, the current one and its neighbours; null marks a gap.
export function pageList(page: number, pages: number): (number | null)[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const keep = new Set([1, pages, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((p) => keep.add(p));
  if (page >= pages - 2) [pages - 1, pages - 2, pages - 3].forEach((p) => keep.add(p));
  const sorted = [...keep].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push(sorted[i - 1] + 1 === p - 1 ? p - 1 : null);
    out.push(p);
  });
  return out;
}
