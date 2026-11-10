"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { CircleAlert, CircleCheck, CircleDashed, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { InputState } from "@/lib/evaluation";
import { cn } from "cn";

/** Native checkbox with a real indeterminate state (set on the element, exposed as "mixed"). */
export function TriStateCheckbox({
  checked,
  indeterminate = false,
  onChange,
  className,
  ...rest
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  className?: string;
} & Omit<React.ComponentProps<"input">, "checked" | "onChange" | "type">) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate, checked]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className={cn("size-[18px] shrink-0 cursor-pointer accent-primary", className)}
      {...rest}
    />
  );
}

const STATE_LOOK: Record<InputState, { icon: LucideIcon; tone: string }> = {
  complete: { icon: CircleCheck, tone: "bg-ok-soft text-ok" },
  partial: { icon: TriangleAlert, tone: "bg-warning-soft text-warning" },
  missing: { icon: CircleDashed, tone: "bg-insufficient-soft text-insufficient" },
  error: { icon: OctagonAlert, tone: "bg-critical-soft text-critical" },
};

/** Entry state as icon + text + colour. */
export function StatePill({ state }: { state: InputState }) {
  const t = useTranslations("wizard.readings.state");
  const { icon: Icon, tone } = STATE_LOOK[state];
  return (
    <span
      data-state={state}
      className={cn("inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold leading-none", tone)}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <span>{t(state)}</span>
    </span>
  );
}

export function Callout({
  tone,
  children,
  role,
  className,
}: {
  tone: "warn" | "crit" | "info";
  children: ReactNode;
  role?: "alert" | "status";
  className?: string;
}) {
  const look = {
    warn: "border-warning/30 bg-warning-soft",
    crit: "border-critical/30 bg-critical-soft",
    info: "border-primary/20 bg-accent",
  }[tone];
  const Icon = tone === "info" ? CircleAlert : tone === "warn" ? TriangleAlert : OctagonAlert;
  const iconTone = { warn: "text-warning", crit: "text-critical", info: "text-primary" }[tone];
  return (
    <div role={role} className={cn("flex items-start gap-3 rounded-xl border p-3.5 text-sm", look, className)}>
      <Icon aria-hidden="true" className={cn("mt-0.5 size-[18px] shrink-0", iconTone)} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export const card = "rounded-2xl border border-border bg-card p-4 shadow-(--shadow-card) sm:p-5";
