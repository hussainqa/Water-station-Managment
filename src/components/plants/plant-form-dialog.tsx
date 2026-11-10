"use client";

import { useId, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { CircleAlert, Check, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createPlantAction, updatePlantAction } from "@/lib/plants/actions";
import { GOVERNORATES, WATER_SOURCES } from "@/lib/plants/constants";
import { validatePlant, type PlantFieldErrors, type PlantFormValues } from "@/lib/plants/schemas";
import { cn } from "cn";
import type { PlantCardData } from "./plant-card";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = add a new plant */
  plant: PlantCardData | null;
};

const control = "h-11 rounded-[11px] border-line-2 px-3 text-[15px] md:text-[15px]";

function Field({
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
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;
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

function PlantForm({ plant, onDone }: { plant: PlantCardData | null; onDone: () => void }) {
  const t = useTranslations("plants");
  const [errors, setErrors] = useState<PlantFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const editing = plant !== null;

  const err = (k: keyof PlantFormValues) => (errors[k] ? t(`errors.${errors[k]}`) : undefined);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setFormError(null);
    const raw = Object.fromEntries(fd) as Record<string, string>;
    const v = validatePlant(raw);
    if (!v.ok) {
      setErrors(v.fieldErrors);
      const first = Object.keys(v.fieldErrors)[0];
      form.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setErrors({});
    startTransition(async () => {
      const r = editing ? await updatePlantAction(plant.id, fd) : await createPlantAction(fd);
      if (r.ok) {
        toast.success(t(editing ? "toast.updated" : "toast.added"));
        onDone();
        return;
      }
      if (r.error === "validation" && r.fieldErrors) setErrors(r.fieldErrors);
      else setFormError(t(`errors.${r.error}`));
    });
  }

  // Editing a field clears its error; the next submit validates again.
  function onInput(e: FormEvent<HTMLFormElement>) {
    const name = (e.target as HTMLInputElement).name as keyof PlantFormValues;
    if (name && errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  }

  return (
    <ResponsiveDialogForm onSubmit={onSubmit} onInput={onInput} noValidate aria-label={t(editing ? "form.editTitle" : "form.addTitle")}>
      <ResponsiveDialogBody>
        <div className="grid grid-cols-1 gap-x-4 gap-y-4 py-1 sm:grid-cols-2">
          <Field label={t("form.name")} required error={err("name")} className="sm:col-span-2">
            {(a) => (
              <Input
                id={a.id}
                name="name"
                defaultValue={plant?.name}
                placeholder={t("form.namePlaceholder")}
                aria-invalid={a.invalid}
                aria-describedby={a.describedBy}
                autoComplete="off"
                autoFocus
                className={control}
              />
            )}
          </Field>
          <Field label={t("form.governorate")} required error={err("governorate")}>
            {(a) => (
              <Select id={a.id} name="governorate" defaultValue={plant?.governorate ?? GOVERNORATES[0]} a={a}>
                {GOVERNORATES.map((g) => (
                  <option key={g} value={g}>
                    {t(`governorates.${g}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("form.location")} required error={err("location")}>
            {(a) => (
              <Input
                id={a.id}
                name="location"
                defaultValue={plant?.location}
                placeholder={t("form.locationPlaceholder")}
                aria-invalid={a.invalid}
                aria-describedby={a.describedBy}
                autoComplete="off"
                className={control}
              />
            )}
          </Field>
          <Field label={t("form.source")} required error={err("waterSource")}>
            {(a) => (
              <Select id={a.id} name="waterSource" defaultValue={plant?.waterSource ?? WATER_SOURCES[0]} a={a}>
                {WATER_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {t(`sources.${s}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("form.engineer")} error={err("engineer")}>
            {(a) => (
              <Input
                id={a.id}
                name="engineer"
                defaultValue={plant?.engineer}
                aria-invalid={a.invalid}
                aria-describedby={a.describedBy}
                autoComplete="off"
                className={control}
              />
            )}
          </Field>
          <Field label={t("form.design")} required error={err("designCapacity")}>
            {(a) => (
              <UnitInput a={a} name="designCapacity" unit={t("form.unit")} defaultValue={plant?.designCapacity} />
            )}
          </Field>
          <Field label={t("form.actual")} error={err("actualCapacity")} hint={t("form.actualHint")}>
            {(a) => (
              <UnitInput a={a} name="actualCapacity" unit={t("form.unit")} defaultValue={plant?.actualCapacity ?? undefined} />
            )}
          </Field>
          <Field label={t("form.notes")} error={err("notes")} className="sm:col-span-2">
            {(a) => (
              <Textarea
                id={a.id}
                name="notes"
                defaultValue={plant?.notes}
                aria-invalid={a.invalid}
                aria-describedby={a.describedBy}
                rows={3}
                className="min-h-20 rounded-[11px] border-line-2 px-3 py-2.5 text-[15px] md:text-[15px]"
              />
            )}
          </Field>
        </div>
        {formError ? (
          <p role="alert" className="mt-4 flex items-start gap-1.5 rounded-lg bg-critical-soft px-3 py-2.5 text-[13.5px] text-critical">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{formError}</span>
          </p>
        ) : null}
      </ResponsiveDialogBody>
      <ResponsiveDialogFooter>
        <ResponsiveDialogClose
          render={<Button type="button" variant="outline" className="h-11 rounded-[11px] px-5 text-[15px]" />}
        >
          {t("form.cancel")}
        </ResponsiveDialogClose>
        <Button type="submit" disabled={pending} aria-busy={pending} className="h-11 rounded-[11px] px-5 text-[15px]">
          {pending ? (
            <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
          ) : (
            <Check aria-hidden="true" />
          )}
          {t(editing ? "form.saveEdit" : "form.save")}
        </Button>
      </ResponsiveDialogFooter>
    </ResponsiveDialogForm>
  );
}

type A = { id: string; describedBy?: string; invalid?: true };

function Select({
  a,
  children,
  ...rest
}: { a: A; children: ReactNode } & Omit<React.ComponentProps<"select">, "children">) {
  return (
    <select
      {...rest}
      id={a.id}
      aria-invalid={a.invalid}
      aria-describedby={a.describedBy}
      className={cn(
        control,
        "w-full min-w-0 cursor-pointer rounded-[11px] border bg-card text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
      )}
    >
      {children}
    </select>
  );
}

function UnitInput({
  a,
  name,
  unit,
  defaultValue,
}: {
  a: A;
  name: string;
  unit: string;
  defaultValue?: number;
}) {
  return (
    <div className="relative">
      <Input
        id={a.id}
        name={name}
        inputMode="decimal"
        autoComplete="off"
        dir="ltr"
        defaultValue={defaultValue}
        aria-invalid={a.invalid}
        aria-describedby={a.describedBy}
        className={cn(control, "num pe-[4.5rem] rtl:text-end")}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-[13px] text-fg-3"
      >
        {unit}
      </span>
    </div>
  );
}

export function PlantFormDialog({ open, onOpenChange, plant }: Props) {
  const t = useTranslations("plants");
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent closeLabel={t("form.close")} size="lg">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{t(plant ? "form.editTitle" : "form.addTitle")}</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <PlantForm plant={plant} onDone={() => onOpenChange(false)} />
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
