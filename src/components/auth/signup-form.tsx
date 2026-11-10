"use client";

import { UserPlus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { signUp } from "@/lib/auth/actions";
import { signUpSchema } from "@/lib/auth/schemas";
import { FormAlert, SubmitButton, TextField } from "./form-parts";
import { useAuthForm } from "./use-auth-form";

export function SignUpForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const f = useAuthForm(signUp, signUpSchema);

  return (
    <>
      <div className="flex flex-col gap-1">
        <h2 className="text-[17px] font-semibold">{t("signup.title")}</h2>
        <p className="text-[13.5px] text-muted-foreground">{t("signup.subtitle")}</p>
      </div>
      <form
        action={f.formAction}
        onSubmit={f.onSubmit}
        noValidate
        className="flex flex-col gap-3.5"
      >
        <input type="hidden" name="locale" value={locale} />
        <FormAlert message={f.formError} />
        <div className="grid gap-3.5 sm:grid-cols-2">
          <TextField
            name="name"
            label={t("fields.name")}
            autoComplete="name"
            defaultValue={f.values.name}
            error={f.fieldError("name")}
            required
          />
          <TextField
            name="jobTitle"
            label={t("fields.jobTitle")}
            autoComplete="organization-title"
            defaultValue={f.values.jobTitle}
            error={f.fieldError("jobTitle")}
            required
          />
        </div>
        <TextField
          name="email"
          type="email"
          label={t("fields.email")}
          placeholder={t("fields.emailPlaceholder")}
          autoComplete="email"
          defaultValue={f.values.email}
          error={f.fieldError("email")}
          required
          ltr
        />
        <div className="grid gap-3.5 sm:grid-cols-2">
          <TextField
            name="password"
            type="password"
            label={t("fields.password")}
            autoComplete="new-password"
            error={f.fieldError("password")}
            required
            ltr
          />
          <TextField
            name="confirmPassword"
            type="password"
            label={t("fields.confirmPassword")}
            autoComplete="new-password"
            error={f.fieldError("confirmPassword")}
            required
            ltr
          />
        </div>
        <p className="text-[12.5px] text-fg-3">{t("fields.passwordHint")}</p>
        <SubmitButton
          pending={f.pending}
          icon={<UserPlus className="rtl:-scale-x-100" aria-hidden="true" />}
        >
          {t("signup.submit")}
        </SubmitButton>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        {t("signup.haveAccount")}{" "}
        <Link
          href="/login"
          className="rounded font-semibold text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {t("signup.signIn")}
        </Link>
      </p>
    </>
  );
}
