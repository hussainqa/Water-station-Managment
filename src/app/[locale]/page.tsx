import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getSession } from "@/lib/auth/session";

// "/" has no screen of its own: signed-in users go to the dashboard, everyone else to login.
export default async function IndexPage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const session = await getSession();
  return redirect({ href: session ? "/dashboard" : "/login", locale });
}
