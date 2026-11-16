"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { Check, CircleAlert, Info, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogFooter,
  ResponsiveDialogForm,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { METHODS, REQUIRED_INPUTS, type Better, type Method } from "@/lib/evaluation";
import { createIndicatorAction, updateIndicatorAction } from "@/lib/indicators/actions";
import {
  fieldErrorsFromZod,
  indicatorFormSchema,
  type FieldErrors,
  type IndicatorFormInput,
} from "@/lib/indicators/schemas";
import type { IndicatorDto, IndicatorGroupDto } from "@/lib/indicators/types";
import { Field, Segmented, control, nativeSelect } from "./form-bits";
import { localName } from "./format";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: IndicatorGroupDto[];
  /** null = add a new indicator */
  indicator: IndicatorDto | null;
  /** Group preselected when adding (the active filter). */
  defaultGroupKey?: string;
  /** Called with the new indicator's group key after a successful create. */
  onCreated?: (groupKey: string) => void;
};

function withoutKey(e: FieldErrors, key: string): FieldErrors {
  if (!(key in e)) return e;
  const next = { ...e };
  delete next[key];
  return next;
}

const LABEL_KEY: Record<string, string> = {
  value: "labelValue",
  numerator: "labelNumerator",
  denominator: "labelDenominator",
};

export function IndicatorFormDialog(props: Props) {
  const { open, onOpenChange, indicator } = props;
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <FormBody key={indicator?.ref ?? "new"} {...props} onClose={() => onOpenChange(false)} />
      ) : null}
    </ResponsiveDialog>
  );
}

function FormBody({
  groups,
  indicator,
  defaultGroupKey,
  onCreated,
  onClose,
}: Props & { onClose: () => void }) {
  const t = useTranslations("indicators");
  const locale = useLocale();
  const [pending, start] = useTransition();
  const editing = indicator !== null;

  const firstGroup = groups[0]?.key ?? "new";
  const [values, setValues] = useState<IndicatorFormInput>(() => ({
    nameAr: indicator?.nameAr ?? "",
    nameEn: indicator?.nameEn ?? "",
    description: indicator?.description ?? "",
    group:
      indicator?.groupKey ??
      (defaultGroupKey && groups.some((g) => g.key === defaultGroupKey) ? defaultGroupKey : firstGroup),
    newGroupAr: "",
    newGroupEn: "",
    method: indicator?.method ?? "direct",
    better: indicator?.better ?? "higher",
    unit: indicator?.unit ?? "",
    labels: indicator?.inputLabels ?? {},
    adoptAll: !editing,
  }));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const set = <K extends keyof IndicatorFormInput>(k: K, v: IndicatorFormInput[K]) => {
    setValues((s) => ({ ...s, [k]: v }));
    setErrors((e) => withoutKey(e, k));
  };
  const setLabel = (key: string, lang: "ar" | "en", v: string) => {
    setValues((s) => ({
      ...s,
      labels: { ...s.labels, [key]: { ar: s.labels[key]?.ar ?? "", en: s.labels[key]?.en ?? "", [lang]: v } },
    }));
    setErrors((e) => withoutKey(e, `labels.${key}`));
  };

  const locked = editing && indicator.used;
  const requiredKeys = REQUIRED_INPUTS[values.method];
  const err = (k: string) => (errors[k] ? t(`errors.${errors[k]}`) : undefined);
  const fixedUnit = useMemo(() => {
    if (values.method === "direct_percent" || values.method === "ratio") return t("form.unitFixedPercent");
    if (values.method === "duration") return t("form.unitFixedHours");
    return null;
  }, [values.method, t]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = indicatorFormSchema.safeParse(values);
    if (!parsed.success) {
      const next = fieldErrorsFromZod(parsed.error);
      setErrors(next);
      const first = Object.keys(next)[0];
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>(`[data-field="${first}"]`)?.focus(),
      );
      return;
    }
    start(async () => {
      const res = indicator
        ? await updateIndicatorAction(indicator.ref.slice(4), values)
        : await createIndicatorAction(values);
      if (res.ok) {
        toast.success(indicator ? t("toast.saved") : t("toast.added"));
        if (!indicator && res.data) onCreated?.(res.data.groupKey);
        onClose();
      } else if (res.fieldErrors && Object.keys(res.fieldErrors).length) {
        setErrors(res.fieldErrors);
      } else {
        setFormError(t(`errors.${res.error}`));
      }
    });
  }

  return (
    <ResponsiveDialogContent closeLabel={t("close")} size="lg">
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle>{editing ? t("form.editTitle") : t("form.addTitle")}</ResponsiveDialogTitle>
        {!editing ? <p className="text-sm text-muted-foreground">{t("form.addText")}</p> : null}
      </ResponsiveDialogHeader>
      <ResponsiveDialogForm onSubmit={onSubmit} noValidate>
        <ResponsiveDialogBody className="grid content-start gap-4 sm:grid-cols-2">
          <Field label={t("form.nameAr")} required error={err("nameAr")} className="sm:col-span-2">
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                data-field="nameAr"
                value={values.nameAr}
                onChange={(e) => set("nameAr", e.target.value)}
                aria-invalid={invalid}
                aria-describedby={describedBy}
                autoComplete="off"
                autoFocus
                className={control}
              />
            )}
          </Field>
          <Field label={t("form.nameEn")} hint={t("form.nameEnHint")} error={err("nameEn")} className="sm:col-span-2">
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                data-field="nameEn"
                dir="ltr"
                value={values.nameEn}
                onChange={(e) => set("nameEn", e.target.value)}
                aria-invalid={invalid}
                aria-describedby={describedBy}
                autoComplete="off"
                className={`${control} rtl:text-end`}
              />
            )}
          </Field>

          <Field label={t("form.group")} required error={err("group")} className="sm:col-span-2">
            {({ id, describedBy, invalid }) => (
              <select
                id={id}
                data-field="group"
                value={values.group}
                onChange={(e) => set("group", e.target.value)}
                aria-invalid={invalid}
                aria-describedby={describedBy}
                className={nativeSelect}
              >
                {groups.map((g) => (
                  <option key={g.key} value={g.key}>
                    {localName(g, locale)}
                  </option>
                ))}
                <option value="new">{t("form.newGroup")}</option>
              </select>
            )}
          </Field>
          {values.group === "new" ? (
            <>
              <Field label={t("form.newGroupAr")} required error={err("newGroupAr")}>
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    data-field="newGroupAr"
                    value={values.newGroupAr}
                    onChange={(e) => set("newGroupAr", e.target.value)}
                    aria-invalid={invalid}
                    aria-describedby={describedBy}
                    autoComplete="off"
                    className={control}
                  />
                )}
              </Field>
              <Field label={t("form.newGroupEn")} error={err("newGroupEn")}>
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    data-field="newGroupEn"
                    dir="ltr"
                    value={values.newGroupEn}
                    onChange={(e) => set("newGroupEn", e.target.value)}
                    aria-invalid={invalid}
                    aria-describedby={describedBy}
                    autoComplete="off"
                    className={`${control} rtl:text-end`}
                  />
                )}
              </Field>
            </>
          ) : null}

          <Field label={t("form.description")} error={err("description")} className="sm:col-span-2">
            {({ id, describedBy, invalid }) => (
              <Textarea
                id={id}
                data-field="description"
                value={values.description}
                onChange={(e) => set("description", e.target.value)}
                aria-invalid={invalid}
                aria-describedby={describedBy}
                className="min-h-16 rounded-[11px] border-line-2 px-3 py-2.5 text-[15px] md:text-[15px]"
              />
            )}
          </Field>

          <div className="sm:col-span-2">
            <Segmented<Method>
              name="method"
              label={t("form.method")}
              value={values.method}
              disabled={locked}
              stackOnPhone
              onChange={(m) => set("method", m)}
              options={METHODS.map((m) => ({ value: m, label: t(`methods.${m}`) }))}
            />
            {locked ? (
              <p className="mt-1.5 flex items-start gap-1.5 text-[12.5px] text-fg-3">
                <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                {t("form.methodLocked")}
              </p>
            ) : null}
          </div>

          {requiredKeys.map((key) => (
            <div key={key} className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
              <Field label={t(`form.${LABEL_KEY[key]}`)} required error={err(`labels.${key}`)}>
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    data-field={`labels.${key}`}
                    value={values.labels[key]?.ar ?? ""}
                    onChange={(e) => setLabel(key, "ar", e.target.value)}
                    aria-invalid={invalid}
                    aria-describedby={describedBy}
                    autoComplete="off"
                    className={control}
                  />
                )}
              </Field>
              <Field label={`${t(`form.${LABEL_KEY[key]}`).replace(/\s*\(.*\)\s*$/, "")} — ${t("form.labelEn")}`}>
                {({ id }) => (
                  <Input
                    id={id}
                    dir="ltr"
                    value={values.labels[key]?.en ?? ""}
                    onChange={(e) => setLabel(key, "en", e.target.value)}
                    autoComplete="off"
                    className={`${control} rtl:text-end`}
                  />
                )}
              </Field>
            </div>
          ))}

          <Field label={t("form.unit")} required={!fixedUnit} error={err("unit")}>
            {({ id, describedBy, invalid }) =>
              fixedUnit ? (
                <Input
                  id={id}
                  readOnly
                  value={fixedUnit}
                  className={`${control} bg-muted text-muted-foreground`}
                />
              ) : (
                <Input
                  id={id}
                  data-field="unit"
                  value={values.unit}
                  onChange={(e) => set("unit", e.target.value)}
                  aria-invalid={invalid}
                  aria-describedby={describedBy}
                  autoComplete="off"
                  className={control}
                />
              )
            }
          </Field>
          <Segmented<Better>
            name="better"
            label={t("form.better")}
            value={values.better}
            onChange={(b) => set("better", b)}
            options={(["higher", "lower"] as const).map((b) => ({ value: b, label: t(`better.${b}`) }))}
          />

          {!editing ? (
            <Label className="cursor-pointer items-start gap-2.5 text-[14px] font-normal leading-snug sm:col-span-2">
              <Checkbox
                checked={values.adoptAll}
                onCheckedChange={(v) => set("adoptAll", v === true)}
                aria-label={t("form.adoptAll")}
                className="mt-0.5 size-[18px]"
              />
              <span>{t("form.adoptAll")}</span>
            </Label>
          ) : null}

          <p className="flex items-start gap-2 rounded-xl bg-nolimits-soft px-3.5 py-2.5 text-[13.5px] text-nolimits sm:col-span-2">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{t("form.info")}</span>
          </p>
          {formError ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-xl bg-critical-soft px-3.5 py-2.5 text-[13.5px] text-critical sm:col-span-2"
            >
              <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>{formError}</span>
            </p>
          ) : null}
        </ResponsiveDialogBody>
        <ResponsiveDialogFooter>
          <Button type="submit" disabled={pending} aria-busy={pending} className="h-11 rounded-[11px] px-4 text-[15px]">
            {pending ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Check aria-hidden="true" />}
            {editing ? t("form.save") : t("form.create")}
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
