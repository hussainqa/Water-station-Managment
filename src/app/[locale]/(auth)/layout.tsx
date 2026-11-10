import Image from "next/image";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { LanguageSwitch } from "@/components/auth/language-switch";
import { SystemLogo } from "@/components/brand/system-logo";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getSession } from "@/lib/auth/session";

/** Centred-card frame shared by the logged-out screens. Signed-in users go to the dashboard. */
export default async function AuthLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  if (await getSession()) return redirect({ href: "/dashboard", locale });

  const t = await getTranslations("auth");
  const tc = await getTranslations("common.app");

  return (
    <main className="flex w-full flex-1 flex-col items-center justify-center gap-3.5 px-4 py-7">
      <div className="flex w-full max-w-[540px] justify-end">
        <LanguageSwitch />
      </div>
      <div className="flex w-full max-w-[540px] flex-col gap-[22px] rounded-3xl border border-border bg-card p-[clamp(20px,4.5vw,36px)] shadow-[var(--shadow-card)]">
        <header className="grid grid-cols-[48px_1fr_48px] items-center gap-3 border-b border-border pb-[18px] text-center sm:grid-cols-[60px_1fr_60px]">
          <Image
            src="/logos/ministry.webp"
            alt={t("institution.ministryLogoAlt")}
            width={120}
            height={120}
            priority
            className="size-12 rounded-full border border-border bg-white object-contain p-[3px] sm:size-[60px]"
          />
          <div className="min-w-0">
            <p className="text-sm leading-normal font-semibold">
              {t("institution.ministry")}
            </p>
            <p className="text-[12.5px] text-muted-foreground">
              {t("institution.universityCollege")}
            </p>
          </div>
          <Image
            src="/logos/university.webp"
            alt={t("institution.universityLogoAlt")}
            width={120}
            height={120}
            priority
            className="size-12 rounded-full border border-border bg-white object-contain p-[3px] sm:size-[60px]"
          />
        </header>

        <div className="flex flex-col items-center gap-2 text-center">
          <SystemLogo size={48} />
          <h1 className="max-w-[24ch] text-[clamp(20px,3.4vw,24px)] leading-snug font-bold text-balance">
            {tc("name")}
          </h1>
        </div>

        {children}

        <dl className="grid gap-2.5 border-t border-border pt-4 sm:grid-cols-2">
          <div className="rounded-xl bg-surface-2 px-3 py-2.5">
            <dt className="text-xs text-fg-3">{t("credits.researcherLabel")}</dt>
            <dd className="text-[13.5px] font-semibold">{t("credits.researcherName")}</dd>
          </div>
          <div className="rounded-xl bg-surface-2 px-3 py-2.5">
            <dt className="text-xs text-fg-3">{t("credits.supervisorLabel")}</dt>
            <dd className="text-[13.5px] font-semibold">{t("credits.supervisorName")}</dd>
          </div>
        </dl>
      </div>
    </main>
  );
}
