"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, usePathname } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { cn } from "cn";

/** Segmented control that switches locale and keeps the current path and query. */
export function LanguageSwitch() {
  const t = useTranslations("auth.language");
  const current = useLocale();
  const pathname = usePathname();
  const query = Object.fromEntries(useSearchParams());

  return (
    <div
      role="group"
      aria-label={t("label")}
      className="inline-flex gap-0.5 rounded-xl bg-secondary p-1"
    >
      {routing.locales.map((locale: Locale) => (
        <Link
          key={locale}
          href={{ pathname, query }}
          locale={locale}
          lang={locale}
          replace
          aria-current={locale === current ? "true" : undefined}
          className={cn(
            "inline-flex min-h-8 min-w-12 items-center justify-center rounded-lg px-3 text-[13px] font-semibold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
            locale === current
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t(locale)}
        </Link>
      ))}
    </div>
  );
}
