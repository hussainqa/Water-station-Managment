"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { Check, CircleAlert, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogForm,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { LIMIT_KINDS, parseNumber, type LimitKind, type Limits } from "@/lib/evaluation";
import { saveLimitsAction } from "@/lib/indicators/actions";
import { checkLimits, LIMIT_FIELDS, parseLimitsForm } from "@/lib/indicators/schemas";
import type { IndicatorDto } from "@/lib/indicators/types";
import { cn } from "cn";
import { Field, Segmented, control } from "./form-bits";
import { formatLimit, localName } from "./format";
import { ThresholdScale } from "./threshold-scale";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  indicator: IndicatorDto | null;
};

function toFields(l: Limits | null): Record<string, string> {
  if (!l) return {};
  const out: Record<string, string> = {};
  for (const f of LIMIT_FIELDS[l.kind]) out[f] = formatLimit((l as unknown as Record<string, number>)[f]);
  return out;
}

export function LimitsDialog({ open, onOpenChange, indicator }: Props) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      {indicator ? (
        <LimitsDialogBody key={indicator.ref} indicator={indicator} onClose={() => onOpenChange(false)} />
      ) : null}
    </ResponsiveDialog>
  );
}

function LimitsDialogBody({ indicator, onClose }: { indicator: IndicatorDto; onClose: () => void }) {
  const t = useTranslations("indicators");
  const locale = useLocale();
  const [pending, start] = useTransition();

  const initial = indicator.limitsDraft;
  const [kind, setKind] = useState<LimitKind>(initial?.kind ?? indicator.better);
  const [fields, setFields] = useState<Record<string, string>>(() => toFields(initial));
  const [none, setNone] = useState(indicator.limitsNone);
  const [test, setTest] = useState("");
  const [tried, setTried] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const unit = indicator.isSystem && t.has(`units.${indicator.unit}`) ? t(`units.${indicator.unit}`) : indicator.unit;
  const methodLabel = t(`methods.${indicator.method}`);

  const parsed = useMemo(() => parseLimitsForm(kind, fields), [kind, fields]);
  const errorCode = useMemo(() => {
    if (none) return null;
    if (!parsed.ok) return parsed.error;
    return checkLimits(parsed.limits, indicator.method);
  }, [none, parsed, indicator.method]);
  const limits = !none && parsed.ok && !errorCode ? parsed.limits : null;
  // "incomplete" is only worth a message once the user tried to save.
  const visibleError = serverError ?? (errorCode && (tried || errorCode !== "incomplete") ? errorCode : null);

  const testNum = parseNumber(test);
  const testValue = testNum !== null && !Number.isNaN(testNum) ? testNum : null;

  const errorText = (code: string) =>
    code === "incomplete" && kind === "range" ? t("errors.incompleteRange") : t(`errors.${code}`);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    setServerError(null);
    if (!none && errorCode) return; // blocked on the client; the server checks again
    start(async () => {
      const res = await saveLimitsAction(
        none ? { ref: indicator.ref, none: true } : { ref: indicator.ref, none: false, limits },
      );
      if (res.ok) {
        toast.success(t("toast.saved"));
        onClose();
      } else {
        setServerError(res.fieldErrors?.limits ?? res.error);
      }
    });
  }

  const nameField = (key: string, label: string) => (
    <Field key={key} label={label} className="min-w-0">
      {({ id, describedBy }) => (
        <div className="flex">
          <Input
            id={id}
            name={key}
            inputMode="decimal"
            dir="ltr"
            value={fields[key] ?? ""}
            onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
            aria-invalid={visibleError ? true : undefined}
            aria-describedby={describedBy}
            className={cn(control, "rounded-e-none text-start rtl:text-end")}
          />
          <span className="num flex min-w-10 items-center justify-center rounded-e-[11px] border border-s-0 border-line-2 bg-muted px-2.5 text-[13px] text-muted-foreground">
            {unit}
          </span>
        </div>
      )}
    </Field>
  );

  return (
    <ResponsiveDialogContent closeLabel={t("close")} size="md">
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle>{t("limits.title", { name: localName(indicator, locale) })}</ResponsiveDialogTitle>
        <ResponsiveDialogDescription className="flex flex-wrap items-center gap-2">
          {indicator.code ? (
            <span className="num rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">{indicator.code}</span>
          ) : null}
          <span>{methodLabel}</span>
        </ResponsiveDialogDescription>
      </ResponsiveDialogHeader>
      <ResponsiveDialogForm onSubmit={onSubmit} noValidate>
        <ResponsiveDialogBody className="flex flex-col gap-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl bg-muted px-3.5 py-3 text-[13.5px]">
            <dt className="text-fg-3">{t("limits.unit")}</dt>
            <dd className="num m-0 font-medium rtl:text-end">{unit || "—"}</dd>
            <dt className="text-fg-3">{t("limits.method")}</dt>
            <dd className="m-0 font-medium">{methodLabel}</dd>
          </dl>

          <Segmented
            name="limit-kind"
            label={t("limits.kind")}
            value={kind}
            disabled={none}
            onChange={(k) => {
              setKind(k);
              setServerError(null);
            }}
            options={LIMIT_KINDS.map((k) => ({ value: k, label: t(`limits.kinds.${k}`) }))}
          />

          <Label className="cursor-pointer items-start gap-2.5 text-[14px] font-normal leading-snug">
            <Checkbox
              checked={none}
              onCheckedChange={(v) => {
                setNone(v === true);
                setServerError(null);
              }}
              aria-label={t("limits.none")}
              className="mt-0.5 size-[18px]"
            />
            <span>{t("limits.none")}</span>
          </Label>

          {none ? null : (
            <div className="grid gap-3.5 sm:grid-cols-2">
              {LIMIT_FIELDS[kind].map((f) => nameField(f, t(`limits.${f}`)))}
            </div>
          )}

          {visibleError && !none ? (
            <p
              role="alert"
              data-testid="limits-error"
              className="flex items-start gap-2 rounded-xl bg-critical-soft px-3.5 py-2.5 text-[13.5px] text-critical"
            >
              <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>{errorText(visibleError)}</span>
            </p>
          ) : null}

          {none ? null : (
            <section
              aria-label={t("limits.preview")}
              className="flex flex-col gap-3 rounded-xl border border-border bg-muted p-3.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <b className="text-sm">{t("limits.preview")}</b>
                <div className="flex w-[200px] max-w-full">
                  <Input
                    inputMode="decimal"
                    dir="ltr"
                    value={test}
                    onChange={(e) => setTest(e.target.value)}
                    placeholder={t("limits.testValue")}
                    aria-label={t("limits.testValue")}
                    name="test"
                    className={cn(control, "h-10 rounded-e-none text-start rtl:text-end")}
                  />
                  <span className="num flex min-w-10 items-center justify-center rounded-e-[11px] border border-s-0 border-line-2 bg-card px-2.5 text-[13px] text-muted-foreground">
                    {unit}
                  </span>
                </div>
              </div>
              {limits ? (
                <ThresholdScale limits={limits} value={testValue} unit={indicator.unit} size="lg" />
              ) : (
                <p className="text-[13px] text-fg-3">{t("limits.previewIncomplete")}</p>
              )}
            </section>
          )}
        </ResponsiveDialogBody>
        <ResponsiveDialogFooter>
          <Button type="submit" disabled={pending} aria-busy={pending} className="h-11 rounded-[11px] px-4 text-[15px]">
            {pending ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Check aria-hidden="true" />}
            {t("limits.save")}
          </Button>
          <ResponsiveDialogClose
            render={<Button type="button" variant="outline" className="h-11 rounded-[11px] px-4 text-[15px]" />}
          >
            {t("cancel")}
          </ResponsiveDialogClose>
        </ResponsiveDialogFooter>
      </ResponsiveDialogForm>
    </ResponsiveDialogContent>
  );
}
