import { Droplets, Languages } from "lucide-react";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

// Phase 0 placeholder: proves both locales boot with the right direction, font and tokens.
export default async function FoundationPage({
  params,
}: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations();
  const other = locale === "ar" ? "en" : "ar";

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center gap-6 p-6">
      <span className="bg-accent text-accent-foreground flex size-12 items-center justify-center rounded-xl">
        <Droplets aria-hidden className="size-6" />
      </span>
      <h1 className="text-2xl leading-snug font-semibold">{t("app.name")}</h1>
      <p className="text-muted-foreground">{t("foundation.ready")}</p>
      <Link
        href="/"
        locale={other}
        className={buttonVariants({ variant: "outline" })}
      >
        <Languages aria-hidden />
        {t("locale.switchTo")}
      </Link>
    </main>
  );
}
