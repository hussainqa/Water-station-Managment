"use client";

import { useState, useTransition, type FormEvent } from "react";
import { CircleAlert, Check, Loader2, Trash2 } from "lucide-react";
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
import {
  deleteGroupAction,
  deleteIndicatorAction,
  renameGroupAction,
} from "@/lib/indicators/actions";
import { fieldErrorsFromZod, groupNameSchema, type FieldErrors } from "@/lib/indicators/schemas";
import type { IndicatorDto, IndicatorGroupDto } from "@/lib/indicators/types";
import { Field, control } from "./form-bits";
import { localName } from "./format";

const btn = "h-11 rounded-[11px] px-4 text-[15px]";

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-xl bg-critical-soft px-3.5 py-2.5 text-[13.5px] text-critical">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

export function DeleteIndicatorDialog({
  indicator,
  onOpenChange,
}: {
  indicator: IndicatorDto | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("indicators");
  const locale = useLocale();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    if (!indicator) return;
    setError(null);
    start(async () => {
      const res = await deleteIndicatorAction(indicator.ref.slice(4));
      if (res.ok) {
        toast.success(t("toast.deleted"));
        onOpenChange(false);
      } else {
        setError(t(`errors.${res.error}`)); // e.g. inUse when a reading appeared meanwhile
      }
    });
  }

  return (
    <ResponsiveDialog
      open={indicator !== null}
      onOpenChange={(o) => {
        if (!o) setError(null);
        onOpenChange(o);
      }}
    >
      {indicator ? (
        <ResponsiveDialogContent closeLabel={t("close")} size="sm">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t("delete.title")}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t("delete.text", { name: localName(indicator, locale) })}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <ResponsiveDialogBody>
            <ErrorLine message={error} />
          </ResponsiveDialogBody>
          <ResponsiveDialogFooter>
            <Button type="button" variant="destructive" disabled={pending} onClick={confirm} className={btn}>
              {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
              {t("delete.confirm")}
            </Button>
            <ResponsiveDialogClose render={<Button type="button" variant="outline" className={btn} />}>
              {t("cancel")}
            </ResponsiveDialogClose>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      ) : null}
    </ResponsiveDialog>
  );
}

export function DeleteGroupDialog({
  group,
  onOpenChange,
  onDeleted,
}: {
  group: IndicatorGroupDto | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const t = useTranslations("indicators");
  const locale = useLocale();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    if (!group) return;
    setError(null);
    start(async () => {
      const res = await deleteGroupAction(group.key.slice(4));
      if (res.ok) {
        toast.success(t("toast.deleted"));
        onDeleted();
        onOpenChange(false);
      } else {
        setError(t(`errors.${res.error}`));
      }
    });
  }

  return (
    <ResponsiveDialog
      open={group !== null}
      onOpenChange={(o) => {
        if (!o) setError(null);
        onOpenChange(o);
      }}
    >
      {group ? (
        <ResponsiveDialogContent closeLabel={t("close")} size="sm">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t("group.deleteTitle")}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t("group.deleteText", { name: localName(group, locale) })}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <ResponsiveDialogBody>
            <ErrorLine message={error} />
          </ResponsiveDialogBody>
          <ResponsiveDialogFooter>
            <Button type="button" variant="destructive" disabled={pending} onClick={confirm} className={btn}>
              {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
              {t("group.delete")}
            </Button>
            <ResponsiveDialogClose render={<Button type="button" variant="outline" className={btn} />}>
              {t("cancel")}
            </ResponsiveDialogClose>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      ) : null}
    </ResponsiveDialog>
  );
}

export function RenameGroupDialog({
  group,
  onOpenChange,
}: {
  group: IndicatorGroupDto | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <ResponsiveDialog open={group !== null} onOpenChange={onOpenChange}>
      {group ? <RenameBody key={group.key} group={group} onClose={() => onOpenChange(false)} /> : null}
    </ResponsiveDialog>
  );
}

function RenameBody({ group, onClose }: { group: IndicatorGroupDto; onClose: () => void }) {
  const t = useTranslations("indicators");
  const [pending, start] = useTransition();
  const [nameAr, setNameAr] = useState(group.nameAr);
  const [nameEn, setNameEn] = useState(group.nameEn ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const err = (k: string) => (errors[k] ? t(`errors.${errors[k]}`) : undefined);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = groupNameSchema.safeParse({ nameAr, nameEn });
    if (!parsed.success) {
      setErrors(fieldErrorsFromZod(parsed.error));
      return;
    }
    start(async () => {
      const res = await renameGroupAction(group.key.slice(4), { nameAr, nameEn });
      if (res.ok) {
        toast.success(t("toast.saved"));
        onClose();
      } else if (res.fieldErrors) setErrors(res.fieldErrors);
      else setFormError(t(`errors.${res.error}`));
    });
  }

  return (
    <ResponsiveDialogContent closeLabel={t("close")} size="sm">
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle>{t("group.renameTitle")}</ResponsiveDialogTitle>
      </ResponsiveDialogHeader>
      <ResponsiveDialogForm onSubmit={onSubmit} noValidate>
        <ResponsiveDialogBody className="flex flex-col gap-4">
          <Field label={t("group.nameAr")} required error={err("nameAr")}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                aria-invalid={invalid}
                aria-describedby={describedBy}
                autoComplete="off"
                className={control}
              />
            )}
          </Field>
          <Field label={t("group.nameEn")} error={err("nameEn")}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                dir="ltr"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                aria-invalid={invalid}
                aria-describedby={describedBy}
                autoComplete="off"
                className={`${control} rtl:text-end`}
              />
            )}
          </Field>
          <ErrorLine message={formError} />
        </ResponsiveDialogBody>
        <ResponsiveDialogFooter>
          <Button type="submit" disabled={pending} className={btn}>
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
            {t("group.save")}
          </Button>
          <ResponsiveDialogClose render={<Button type="button" variant="outline" className={btn} />}>
            {t("cancel")}
          </ResponsiveDialogClose>
        </ResponsiveDialogFooter>
      </ResponsiveDialogForm>
    </ResponsiveDialogContent>
  );
}
