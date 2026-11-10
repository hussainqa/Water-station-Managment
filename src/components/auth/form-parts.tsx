"use client";

import { useId, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { CircleAlert, CircleCheck, Eye, EyeOff, Loader2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "cn";

type FieldProps = {
  name: string;
  label: string;
  type?: "text" | "email" | "password";
  autoComplete?: string;
  defaultValue?: string;
  placeholder?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  readOnly?: boolean;
  autoFocus?: boolean;
  /** Email and password: always left-to-right, but aligned to the reading start. */
  ltr?: boolean;
};

export function TextField({
  name,
  label,
  type = "text",
  autoComplete,
  defaultValue,
  placeholder,
  error,
  hint,
  required,
  readOnly,
  autoFocus,
  ltr,
}: FieldProps) {
  const t = useTranslations("auth");
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const [shown, setShown] = useState(false);
  const isPassword = type === "password";
  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="gap-0.5 text-[13px] leading-snug">
        {label}
        {required ? (
          <span aria-hidden="true" className="text-critical">
            *
          </span>
        ) : null}
      </Label>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={isPassword && shown ? "text" : type}
          autoComplete={autoComplete}
          defaultValue={defaultValue}
          placeholder={placeholder}
          required={required}
          readOnly={readOnly}
          autoFocus={autoFocus}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          dir={ltr ? "ltr" : undefined}
          spellCheck={ltr ? false : undefined}
          className={cn(
            "h-11 rounded-[11px] border-line-2 px-3 text-[15px] md:text-[15px]",
            ltr && "rtl:text-end",
            isPassword && "pe-11 ps-11",
            readOnly && "bg-muted text-muted-foreground",
          )}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            aria-label={shown ? t("fields.hidePassword") : t("fields.showPassword")}
            aria-pressed={shown}
            className="absolute end-1 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {shown ? (
              <EyeOff className="size-[18px]" aria-hidden="true" />
            ) : (
              <Eye className="size-[18px]" aria-hidden="true" />
            )}
          </button>
        ) : null}
      </div>
      {error ? (
        <p id={errorId} className="flex items-start gap-1.5 text-[13px] text-critical">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
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

export function SubmitButton({
  pending,
  children,
  icon,
}: {
  pending: boolean;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <Button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="h-12 w-full rounded-[13px] text-[15.5px]"
    >
      {pending ? (
        <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
      ) : (
        icon
      )}
      {children}
    </Button>
  );
}

export function FormAlert({
  message,
  tone = "error",
}: {
  message?: string;
  tone?: "error" | "success";
}) {
  if (!message) return null;
  const Icon = tone === "error" ? CircleAlert : CircleCheck;
  return (
    <Alert
      variant={tone === "error" ? "destructive" : "default"}
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "items-center px-3 py-2.5 text-[13.5px]",
        tone === "error" ? "bg-critical-soft" : "bg-ok-soft text-ok",
      )}
    >
      <Icon aria-hidden="true" />
      <div>{message}</div>
    </Alert>
  );
}
