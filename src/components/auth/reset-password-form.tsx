"use client";

import { LinkIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { resetPassword } from "@/lib/auth/actions";
import { resetPasswordSchema } from "@/lib/auth/schemas";
import { FormAlert, SubmitButton, TextField } from "./form-parts";
import { useAuthForm } from "./use-auth-form";

const linkClass =
  "rounded text-[13.5px] font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50";

/** `token` is null when the link has no token or Better Auth reported it invalid/expired. */
export function ResetPasswordForm({ token }: { token: string | null }) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const f = useAuthForm(resetPassword, resetPasswordSchema);
  const invalid = !token || f.formErrorCode === "invalidToken";

  if (invalid) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <LinkIcon className="size-8 text-critical" aria-hidden="true" />
        <h2 className="text-[17px] font-semibold">{t("reset.invalidTitle")}</h2>
        <p role="alert" className="max-w-[40ch] text-[14px] text-muted-foreground">
          {t("errors.invalidToken")}
        </p>
        <Link href="/forgot-password" className={linkClass}>
          {t("reset.requestNew")}
        </Link>
        <Link href="/login" className={linkClass}>
          {t("reset.back")}
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <h2 className="text-[17px] font-semibold">{t("reset.title")}</h2>
        <p className="text-[13.5px] text-muted-foreground">{t("reset.subtitle")}</p>
      </div>
      <form
        action={f.formAction}
        onSubmit={f.onSubmit}
        noValidate
        className="flex flex-col gap-4"
      >
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="token" value={token} />
        <FormAlert message={f.formError} />
        <TextField
          name="password"
          type="password"
          label={t("fields.newPassword")}
          autoComplete="new-password"
          hint={t("fields.passwordHint")}
          error={f.fieldError("password")}
          ltr
          autoFocus
        />
        <TextField
          name="confirmPassword"
          type="password"
          label={t("fields.confirmNewPassword")}
          autoComplete="new-password"
          error={f.fieldError("confirmPassword")}
          ltr
        />
        <SubmitButton pending={f.pending}>{t("reset.submit")}</SubmitButton>
      </form>
    </>
  );
}
