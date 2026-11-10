import { setRequestLocale } from "next-intl/server";
import { PlaceholderPage } from "@/components/shell/placeholder-page";
import { requireUser } from "@/lib/auth/session";

export default async function Page({ params }: PageProps<"/[locale]/indicators">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireUser();
  return <PlaceholderPage page="indicators" />;
}
