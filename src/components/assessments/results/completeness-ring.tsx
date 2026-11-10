import { cn } from "cn";

/** Ring of the data completeness. The text beside it carries the numbers; the ring is decorative. */
export function CompletenessRing({ percent, className }: { percent: number; className?: string }) {
  const r = 28;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, percent));
  return (
    <svg viewBox="0 0 72 72" aria-hidden="true" className={cn("size-[72px] shrink-0 -rotate-90 rtl:-scale-x-100", className)}>
      <circle cx="36" cy="36" r={r} fill="none" strokeWidth="8" className="stroke-muted" style={{ stroke: "var(--bg-2)" }} />
      <circle
        cx="36"
        cy="36"
        r={r}
        fill="none"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${(p / 100) * c} ${c}`}
        style={{ stroke: "var(--teal)" }}
      />
    </svg>
  );
}
