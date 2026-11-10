"use client";

import { useId, type ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "cn";

export const control = "h-11 rounded-[11px] border-line-2 px-3 text-[15px] md:text-[15px]";
export const nativeSelect =
  "h-11 w-full rounded-[11px] border border-line-2 bg-transparent px-3 text-[15px] outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive dark:bg-input/30";

export function Field({
  label,
  required,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  children: (a: { id: string; describedBy?: string; invalid?: true }) => ReactNode;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={id} className="gap-0.5 text-[13px] leading-snug">
        {label}
        {required ? (
          <span aria-hidden="true" className="text-critical">
            *
          </span>
        ) : null}
      </Label>
      {children({ id, describedBy, invalid: error ? true : undefined })}
      {error ? (
        <p id={errorId} className="flex items-start gap-1.5 text-[13px] text-critical">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="text-[12.5px] text-fg-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Segmented single choice built on native radios (keyboard + screen reader friendly). */
export function Segmented<T extends string>({
  name,
  label,
  value,
  options,
  onChange,
  disabled,
  stackOnPhone,
  className,
}: {
  name: string;
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
  /** For long option labels: one option per row below 640 px. */
  stackOnPhone?: boolean;
  className?: string;
}) {
  return (
    <fieldset disabled={disabled} className={cn("min-w-0", className)}>
      <legend className="mb-1.5 text-[13px] font-medium leading-snug">{label}</legend>
      <div
        className={cn(
          "gap-1 rounded-[11px] bg-secondary p-1",
          stackOnPhone ? "grid grid-cols-1 sm:flex sm:flex-wrap" : "flex flex-wrap",
        )}
      >
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "relative flex min-h-9 flex-1 cursor-pointer items-center rounded-lg px-3 py-1.5 text-[13.5px] leading-snug transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
              stackOnPhone
                ? "justify-start text-start sm:justify-center sm:text-center"
                : "justify-center text-center",
              value === o.value
                ? "bg-card font-semibold text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
