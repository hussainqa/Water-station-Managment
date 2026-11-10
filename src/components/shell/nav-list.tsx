"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "cn";
import { NAV_ITEMS, NAV_SECTIONS, activeHref } from "./nav";

export const navItemClass =
  "flex min-h-[38px] w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-start text-[14.5px] text-foreground outline-none transition-colors hover:bg-background focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-[18px] [&_svg]:shrink-0";

/** Sidebar / drawer navigation: sections, items, active highlight. */
export function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("shell");
  const pathname = usePathname();
  const current = activeHref(pathname);

  return (
    <nav aria-label={t("nav.label")}>
      {NAV_SECTIONS.map((section) => (
        <div key={section} className="pb-1 pt-2.5">
          <p className="px-2.5 pb-1 text-xs font-medium text-fg-3">
            {t(`nav.sections.${section}`)}
          </p>
          <ul className="flex flex-col gap-px">
            {NAV_ITEMS.filter((i) => i.section === section).map((item) => {
              const active = item.href === current;
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      navItemClass,
                      active &&
                        "bg-accent font-semibold text-accent-foreground hover:bg-accent",
                    )}
                  >
                    <Icon
                      aria-hidden="true"
                      className={active ? "text-primary" : "text-muted-foreground"}
                    />
                    <span>{t(`nav.items.${item.id}`)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
