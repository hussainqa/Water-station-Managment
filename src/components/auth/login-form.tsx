"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { signIn } from "@/lib/auth/actions";
import { signInSchema } from "@/lib/auth/schemas";
import { FormAlert, SubmitButton, TextField } from "./form-parts";
import { useAuthForm } from "./use-auth-form";

export function LoginForm({ resetSuccess }: { resetSuccess?: boolean }) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const f = useAuthForm(signIn, signInSchema);

  return (
    <>
      <form
        action={f.formAction}
        onSubmit={f.onSubmit}
        noValidate
        aria-label={t("login.title")}
        className="flex flex-col gap-4"
      >
        <input type="hidden" name="locale" value={locale} />
        {resetSuccess ? (
          <FormAlert tone="success" message={t("login.resetSuccess")} />
        ) : null}
        <FormAlert message={f.formError} />
        <TextField
          name="email"
          type="email"
          label={t("fields.email")}
          placeholder={t("fields.emailPlaceholder")}
          autoComplete="email"
          defaultValue={f.values.email}
          error={f.fieldError("email")}
          ltr
          autoFocus
        />
        <TextField
          name="password"
          type="password"
          label={t("fields.password")}
          autoComplete="current-password"
          error={f.fieldError("password")}
          ltr
        />
        <SubmitButton pending={f.pending}>{t("login.submit")}</SubmitButton>
        <Link
          href="/forgot-password"
          className="self-center rounded text-[13.5px] font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {t("login.forgot")}
        </Link>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        {t("login.noAccount")}{" "}
        <Link
          href="/signup"
          className="rounded font-semibold text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {t("login.createAccount")}
        </Link>
      </p>
    </>
  );
}
