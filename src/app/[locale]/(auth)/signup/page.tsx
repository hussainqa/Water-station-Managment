import { setRequestLocale } from "next-intl/server";
import { SignUpForm } from "@/components/auth/signup-form";

export default async function Page({ params }: PageProps<"/[locale]/signup">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <SignUpForm />;
}
