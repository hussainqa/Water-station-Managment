"use client";

import { useTranslations } from "next-intl";
import { updateProfile } from "@/lib/auth/actions";
import { profileSchema } from "@/lib/auth/schemas";
import { FormAlert, SubmitButton, TextField } from "./form-parts";
import { useAuthForm } from "./use-auth-form";

export function ProfileForm({
  name,
  jobTitle,
  email,
}: {
  name: string;
  jobTitle: string;
  email: string;
}) {
  const t = useTranslations("auth");
  const f = useAuthForm(updateProfile, profileSchema);

  return (
    <form
      action={f.formAction}
      onSubmit={f.onSubmit}
      noValidate
      className="flex max-w-xl flex-col gap-4"
    >
      <FormAlert message={f.formError} />
      {f.ok && !f.pending ? <FormAlert tone="success" message={t("profile.saved")} /> : null}
      <TextField
        name="name"
        label={t("fields.name")}
        autoComplete="name"
        defaultValue={f.values.name ?? name}
        error={f.fieldError("name")}
        required
      />
      <TextField
        name="jobTitle"
        label={t("fields.jobTitle")}
        autoComplete="organization-title"
        defaultValue={f.values.jobTitle ?? jobTitle}
        error={f.fieldError("jobTitle")}
        required
      />
      <TextField
        name="email"
        type="email"
        label={t("fields.email")}
        defaultValue={email}
        hint={t("profile.emailReadonly")}
        readOnly
        ltr
      />
      <div>
        <SubmitButton pending={f.pending}>{t("profile.submit")}</SubmitButton>
      </div>
    </form>
  );
}
