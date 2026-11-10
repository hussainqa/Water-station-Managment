"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { setLocaleAction } from "@/lib/account/actions";
import { cn } from "cn";

const OPTIONS: { id: Locale; lang: Locale }[] = [
  { id: "ar", lang: "ar" },
  { id: "en", lang: "en" },
];

/** عربي / EN. Keeps the current path and saves the choice on the user's profile. */
export function LanguageSwitch() {
  const t = useTranslations("shell");
  const tc = useTranslations("common");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(next: Locale) {
    if (next === locale || pending) return;
    startTransition(async () => {
      const r = await setLocaleAction(next);
      if (!r.ok) toast.error(t("lang.saveFailed"));
      router.replace(pathname, { locale: next });
    });
  }

  return (
    <div
      role="group"
      aria-label={tc("locale.label")}
      className="inline-flex gap-0.5 rounded-[10px] bg-secondary p-[3px]"
    >
      {OPTIONS.map(({ id }) => {
        const active = id === locale;
        return (
          <button
            key={id}
            type="button"
            lang={id}
            aria-pressed={active}
            disabled={pending}
            onClick={() => change(id)}
            className={cn(
              "min-h-[34px] min-w-11 rounded-lg px-2.5 text-[13px] font-semibold text-muted-foreground outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
              active && "bg-card text-foreground shadow-sm",
            )}
          >
            {t(`lang.${id}`)}
          </button>
        );
      })}
    </div>
  );
}
