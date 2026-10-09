import React, { useState } from "react";
import { Star } from "lucide-react";

// Read-only when there's no onChange (a rating shown on a class), tappable when there is (writing a review).
export default function Stars({ value = 0, onChange, size = 16, label = "Rating" }) {
  const [hover, setHover] = useState(0);
  const shown = hover || Math.round(value || 0);
  if (!onChange) {
    return (
      <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${value || 0} out of 5 stars`}>
        {[1, 2, 3, 4, 5].map((n) => <Star key={n} width={size} height={size} strokeWidth={2} style={{ color: n <= shown ? "var(--accent)" : "rgb(var(--c-muted) / 0.5)" }} fill={n <= shown ? "currentColor" : "none"} aria-hidden />)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1" role="radiogroup" aria-label={label} onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} data-testid={`star-${n}`}
          onClick={() => onChange(n === value ? 0 : n)} onMouseEnter={() => setHover(n)} className="rounded p-0.5">
          <Star width={size} height={size} strokeWidth={2} style={{ color: n <= shown ? "var(--accent)" : "rgb(var(--c-muted) / 0.6)" }} fill={n <= shown ? "currentColor" : "none"} aria-hidden />
        </button>))}
    </span>
  );
}

export const RatingChip = ({ rating, className = "" }) => (
  rating?.count ? <span className={"inline-flex items-center gap-1 text-xs text-muted " + className} data-testid="rating-chip"><Star width={12} height={12} fill="currentColor" style={{ color: "var(--accent)" }} aria-hidden /><b className="font-semibold text-ink">{rating.avg.toFixed(1)}</b>({rating.count})</span>
    : <span className={"text-xs text-muted " + className}>New</span>
);
