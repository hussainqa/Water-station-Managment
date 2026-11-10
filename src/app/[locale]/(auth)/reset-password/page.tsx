import { setRequestLocale } from "next-intl/server";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export default async function ResetPasswordPage({
  params,
  searchParams,
}: PageProps<"/[locale]/reset-password">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { token, error } = await searchParams;
  // Better Auth appends ?error=INVALID_TOKEN when the emailed link is bad or expired.
  const valid = typeof token === "string" && token.length > 0 && !error;
  return <ResetPasswordForm token={valid ? token : null} />;
}
