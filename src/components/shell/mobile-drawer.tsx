"use client";

import { useState } from "react";
import { Menu, UserRound } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Link } from "@/i18n/navigation";
import { localeDirection, type Locale } from "@/i18n/routing";
import { BrandBlock } from "./brand-block";
import { NavList, navItemClass } from "./nav-list";
import { SignOutButton } from "./sign-out-button";
import { ThemeSegmented } from "./theme-controls";
import type { ShellUser } from "./types";
import { UserAvatar } from "./user-avatar";

/** Hamburger + drawer (< 1024 px). Opens from the start side; holds the full nav and the account items. */
export function MobileDrawer({ user, openProblems = 0 }: { user: ShellUser; openProblems?: number }) {
  const t = useTranslations("shell");
  const locale = useLocale() as Locale;
  const [open, setOpen] = useState(false);
  const side = localeDirection[locale] === "rtl" ? "right" : "left";
  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="outline"
            aria-label={t("menu.open")}
            className="size-10 rounded-xl border-transparent bg-transparent text-foreground hover:bg-card lg:hidden"
          />
        }
      >
        <Menu aria-hidden="true" className="size-5" />
      </SheetTrigger>
      <SheetContent
        side={side}
        showCloseButton={false}
        className="gap-0 overflow-y-auto rounded-[20px] border border-border p-0 data-[side=left]:inset-y-2.5 data-[side=left]:left-2.5 data-[side=left]:h-auto data-[side=left]:w-[min(290px,calc(100vw-20px))] data-[side=right]:inset-y-2.5 data-[side=right]:right-2.5 data-[side=right]:h-auto data-[side=right]:w-[min(290px,calc(100vw-20px))] shadow-(--shadow-pop)"
      >
        <SheetTitle className="sr-only">{t("menu.title")}</SheetTitle>
        <SheetDescription className="sr-only">{t("brand.name")}</SheetDescription>
        <div className="flex min-h-full flex-col px-3 pb-3 pt-[18px]">
          <BrandBlock />
          <NavList onNavigate={close} openProblems={openProblems} />
          <div className="mt-auto flex flex-col gap-2 pt-4">
            <div className="flex items-center gap-2.5 rounded-xl bg-surface-2 p-2.5">
              <UserAvatar name={user.name} className="size-9" />
              <div className="min-w-0 text-start leading-tight">
                <p className="truncate text-sm font-semibold">{user.name}</p>
                <p className="truncate text-xs text-fg-3">{user.jobTitle}</p>
              </div>
            </div>
            <Link href="/profile" onClick={close} className={navItemClass}>
              <UserRound aria-hidden="true" className="text-muted-foreground" />
              <span>{t("user.profile")}</span>
            </Link>
            <ThemeSegmented />
            <SignOutButton />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
