import React from "react";
import { cx } from "./ui";
import { STATUS_HELP, STATUS_LABEL } from "../lib/navigator";

// Small pieces shared by the Navigator page, the guide chat and the Hub's next-steps card.
export const STATUS_STYLE = {
  open: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", rolling: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  check: "bg-amber-500/15 text-amber-700 dark:text-amber-400", closed: "bg-red-500/15 text-red-600 dark:text-red-400", paused: "bg-red-500/15 text-red-600 dark:text-red-400",
};
export const FIT_LABEL = { strong: "Strong fit", possible: "Possible fit", later: "Later", skip: "Not a fit" };
export const FIT_STYLE = { strong: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", possible: "bg-sky-500/15 text-sky-600 dark:text-sky-400", later: "bg-amber-500/15 text-amber-700 dark:text-amber-400", skip: "bg-ink/10 text-muted" };

export function Status({ status }) {
  return <span title={STATUS_HELP[status]} className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS_STYLE[status] || STATUS_STYLE.check)}>{STATUS_LABEL[status] || status}</span>;
}

// A small ring showing how complete the profile is. The fuller it is, the sharper the matches.
export function Ring({ percent, size = 52 }) {
  const r = (size - 8) / 2; const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={`Profile ${percent}% complete`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="5" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - percent / 100)} />
      </svg>
      <span className="absolute text-xs font-bold tabular-nums">{percent}%</span>
    </span>
  );
}
