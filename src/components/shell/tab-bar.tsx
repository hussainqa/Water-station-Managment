"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "cn";
import { NAV_ITEMS, activeHref } from "./nav";

/** Fixed bottom bar with five tabs (< 1024 px). */
export function TabBar() {
  const t = useTranslations("shell");
  const current = activeHref(usePathname());
  const tabs = NAV_ITEMS.filter((i) => i.tab);

  return (
    <nav
      aria-label={t("tabs.label")}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-(--glass) pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] ps-[max(0.625rem,env(safe-area-inset-left))] pe-[max(0.625rem,env(safe-area-inset-right))] backdrop-blur-[20px] backdrop-saturate-150 lg:hidden"
    >
      <ul className="flex justify-around">
        {tabs.map((item) => {
          const active = item.href === current;
          const Icon = item.icon;
          return (
            <li key={item.id} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "mx-auto flex min-h-12 w-full flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-medium text-fg-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  active && "text-primary",
                )}
              >
                <Icon aria-hidden="true" className="size-[22px]" />
                <span>{t(`tabs.${item.tab!}`)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
