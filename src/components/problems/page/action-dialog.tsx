"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { control, Field, nativeSelect } from "@/components/indicators/form-bits";
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogForm,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { addCustomActionAction, updateCustomActionAction } from "@/lib/problems/actions";
import { NAME_MAX, TEXT_MAX, type ObstacleTarget } from "@/lib/problems/schemas";
import type { CustomActionDto } from "@/lib/problems/types";
import { obstacleLabel } from "./bits";
import { useProblem } from "./problem-context";

type State = { mode: "add" } | { mode: "edit"; action: CustomActionDto } | null;

const encode = (t: ObstacleTarget | null | undefined) => (!t ? "" : t.kind === "system" ? `system:${t.code}` : `custom:${t.id}`);
function decode(v: string): ObstacleTarget | null {
  if (v.startsWith("system:")) return { kind: "system", code: v.slice(7) };
  if (v.startsWith("custom:")) return { kind: "custom", id: v.slice(7) };
  return null;
}

/** "Add a case-specific action" (and edit). */
export function ActionDialog({ state, onOpenChange }: { state: State; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("problems.actionDialog");
  const te = useTranslations("problems.errors");
  const { problem, locale, mutate, failureText } = useProblem();
  const editing = state?.mode === "edit" ? state.action : null;
  const chooseId = useId();

  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [rationale, setRationale] = useState(editing?.rationale ?? "");
  const [linked, setLinked] = useState(encode(editing?.linkedObstacle));
  const [chooseNow, setChooseNow] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!name.trim()) {
      setErrors({ name: te("required") });
      return;
    }
    setErrors({});
    setFormError(null);
    setBusy(true);
    const base = {
      problemId: problem.header.id,
      name,
      description,
      rationale,
      linkedObstacle: decode(linked),
    };
    const r = await mutate(
      null,
      () => (editing ? updateCustomActionAction({ ...base, customActionId: editing.id }) : addCustomActionAction({ ...base, chooseNow })),
      { silent: true },
    );
    setBusy(false);
    if (r.ok) {
      onOpenChange(false);
      return;
    }
    if (r.error === "validation") {
      const fe: Record<string, string> = {};
      for (const [k, v] of Object.entries(r.fieldErrors ?? {})) fe[k] = te.has(v) ? te(v) : te("validation");
      setErrors(fe);
    } else {
      setFormError(failureText(r));
    }
  }

  return (
    <ResponsiveDialog open={state !== null} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent closeLabel={t("close")} size="lg" data-testid="action-dialog">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{editing ? t("editTitle") : t("addTitle")}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>{t("sub")}</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <ResponsiveDialogForm onSubmit={submit} noValidate>
          <ResponsiveDialogBody className="flex flex-col gap-4 pb-4">
            <Field label={t("name")} required error={errors.name}>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  data-testid="action-name"
                  value={name}
                  maxLength={NAME_MAX}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  onChange={(e) => setName(e.target.value)}
                  className={control}
                />
              )}
            </Field>
            <Field label={t("description")} error={errors.description}>
              {({ id, describedBy, invalid }) => (
                <Textarea
                  id={id}
                  data-testid="action-description"
                  value={description}
                  maxLength={TEXT_MAX}
                  rows={3}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  onChange={(e) => setDescription(e.target.value)}
                  className="min-h-20 text-[15px]"
                />
              )}
            </Field>
            <Field label={t("linkedObstacle")}>
              {({ id }) => (
                <select
                  id={id}
                  data-testid="action-linked"
                  value={linked}
                  onChange={(e) => setLinked(e.target.value)}
                  className={nativeSelect}
                >
                  <option value="">{t("noLinked")}</option>
                  {problem.obstacles.map((o) => (
                    <option key={o.key} value={encode(o.kind === "system" ? { kind: "system", code: o.code } : { kind: "custom", id: o.id })}>
                      {obstacleLabel(o, locale)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={t("rationale")} error={errors.rationale}>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  data-testid="action-rationale"
                  value={rationale}
                  maxLength={TEXT_MAX}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  onChange={(e) => setRationale(e.target.value)}
                  className={control}
                />
              )}
            </Field>
            {!editing ? (
              <label htmlFor={chooseId} className="flex cursor-pointer items-start gap-3 text-[14px] font-medium">
                <Checkbox
                  id={chooseId}
                  data-testid="action-choose-now"
                  checked={chooseNow}
                  onCheckedChange={(v) => setChooseNow(v === true)}
                  className="mt-0.5 size-5 rounded-md"
                />
                <span>{t("chooseNow")}</span>
              </label>
            ) : null}
            {formError ? (
              <p role="alert" className="m-0 text-[13.5px] font-medium text-critical">
                {formError}
              </p>
            ) : null}
          </ResponsiveDialogBody>
          <ResponsiveDialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="h-11 rounded-[11px] px-4 text-[15px]">
              {t("cancel")}
            </Button>
            <Button type="submit" data-testid="action-submit" disabled={busy} aria-busy={busy} className="h-11 rounded-[11px] px-5 text-[15px]">
              {busy ? t("saving") : editing ? t("submitEdit") : t("submitAdd")}
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogForm>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
