"use client";

import { MailCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { requestPasswordReset } from "@/lib/auth/actions";
import { forgotPasswordSchema } from "@/lib/auth/schemas";
import { FormAlert, SubmitButton, TextField } from "./form-parts";
import { useAuthForm } from "./use-auth-form";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const f = useAuthForm(requestPasswordReset, forgotPasswordSchema);
  const backLink = (
    <Link
      href="/login"
      className="self-center rounded text-[13.5px] font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {t("forgot.back")}
    </Link>
  );

  if (f.ok) {
    return (
      <div className="flex flex-col items-center gap-4 text-center" role="status">
        <MailCheck className="size-8 text-ok" aria-hidden="true" />
        <h2 className="text-[17px] font-semibold">{t("forgot.sentTitle")}</h2>
        <p className="max-w-[40ch] text-[14px] text-muted-foreground">
          {t("forgot.sent")}
        </p>
        {backLink}
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <h2 className="text-[17px] font-semibold">{t("forgot.title")}</h2>
        <p className="text-[13.5px] text-muted-foreground">{t("forgot.subtitle")}</p>
      </div>
      <form
        action={f.formAction}
        onSubmit={f.onSubmit}
        noValidate
        className="flex flex-col gap-4"
      >
        <input type="hidden" name="locale" value={locale} />
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
        <SubmitButton pending={f.pending}>{t("forgot.submit")}</SubmitButton>
        {backLink}
      </form>
    </>
  );
}
