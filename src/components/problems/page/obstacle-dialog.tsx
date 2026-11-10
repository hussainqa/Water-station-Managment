"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { control, Field, Segmented } from "@/components/indicators/form-bits";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { addCustomObstacleAction, updateCustomObstacleAction } from "@/lib/problems/actions";
import { NAME_MAX, TEXT_MAX } from "@/lib/problems/schemas";
import type { SelectedObstacle } from "@/lib/problems/types";
import { useProblem } from "./problem-context";

type Custom = Extract<SelectedObstacle, { kind: "custom" }>;
type State = { mode: "add" } | { mode: "edit"; obstacle: Custom } | null;

/** "Add an unlisted obstacle" (and edit): name, description, rationale, classification. */
export function ObstacleDialog({ state, onOpenChange }: { state: State; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("problems.obstacleDialog");
  const te = useTranslations("problems.errors");
  const to = useTranslations("problems.obstacles");
  const { problem, mutate, failureText } = useProblem();
  const editing = state?.mode === "edit" ? state.obstacle : null;

  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [rationale, setRationale] = useState(editing?.rationale ?? "");
  const [classification, setClassification] = useState<"confirmed" | "possible">(editing?.classification ?? "confirmed");
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
    const base = { problemId: problem.header.id, name, description, rationale, classification };
    const r = await mutate(
      null,
      () =>
        editing
          ? updateCustomObstacleAction({ ...base, customObstacleId: editing.id })
          : addCustomObstacleAction(base),
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
      <ResponsiveDialogContent closeLabel={t("close")} size="lg" data-testid="obstacle-dialog">
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
                  data-testid="obstacle-name"
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
                  data-testid="obstacle-description"
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
            <Field label={t("rationale")} error={errors.rationale}>
              {({ id, describedBy, invalid }) => (
                <Textarea
                  id={id}
                  data-testid="obstacle-rationale"
                  value={rationale}
                  maxLength={TEXT_MAX}
                  rows={3}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  onChange={(e) => setRationale(e.target.value)}
                  className="min-h-20 text-[15px]"
                />
              )}
            </Field>
            <Segmented<"confirmed" | "possible">
              name="dialog-classification"
              label={t("classification")}
              value={classification}
              onChange={setClassification}
              options={[
                { value: "confirmed", label: to("confirmed") },
                { value: "possible", label: to("possible") },
              ]}
            />
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
            <Button type="submit" data-testid="obstacle-submit" disabled={busy} aria-busy={busy} className="h-11 rounded-[11px] px-5 text-[15px]">
              {busy ? t("saving") : editing ? t("submitEdit") : t("submitAdd")}
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogForm>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
