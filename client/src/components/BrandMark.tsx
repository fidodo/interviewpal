// The InterviewPal logo: a speech bubble with voice-level bars, because the app is about answering out loud. The
// bars echo the recording meter in the landing page's demo. Keep index.html's favicon in step with this shape.
export function BrandMark({ className = "brand-mark" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path
        className="brand-mark-bubble"
        d="M10 2.5h12a8 8 0 0 1 8 8v5a8 8 0 0 1-8 8h-8.5L7 29.5v-6.4A8 8 0 0 1 2 15.5v-5a8 8 0 0 1 8-8z"
      />
      <g className="brand-mark-bars">
        <rect x="8.4" y="10" width="2.8" height="6" rx="1.4" />
        <rect x="12.6" y="7" width="2.8" height="12" rx="1.4" />
        <rect x="16.8" y="8.5" width="2.8" height="9" rx="1.4" />
        <rect x="21" y="11" width="2.8" height="4" rx="1.4" />
      </g>
    </svg>
  );
}
