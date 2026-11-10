"use client";

import { useTranslations } from "next-intl";
import { cn } from "cn";

/** Open-problems count on the "Problems" nav item: hidden at zero, accessible label with ICU plural. */
export function NavCountBadge({ count, className }: { count: number; className?: string }) {
  const t = useTranslations("shell");
  if (count <= 0) return null;
  return (
    <span
      role="img"
      data-testid="open-problems-badge"
      aria-label={t("badge.openProblems", { count })}
      className={cn(
        "num ms-auto grid h-5 min-w-5 place-items-center rounded-full bg-critical px-1.5 text-[11.5px] font-semibold text-white",
        className,
      )}
    >
      <span aria-hidden="true">{count > 99 ? "99+" : count}</span>
    </span>
  );
}

/** Small marker on the Problems tab of the phone tab bar. */
export function TabDot({ count }: { count: number }) {
  const t = useTranslations("shell");
  if (count <= 0) return null;
  return (
    <span
      role="img"
      data-testid="open-problems-dot"
      aria-label={t("badge.openProblems", { count })}
      className="absolute end-[calc(50%-18px)] top-1.5 size-2.5 rounded-full bg-critical ring-2 ring-background"
    />
  );
}
