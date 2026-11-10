"use client";

import { useTransition } from "react";
import { LogOut, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "@/i18n/navigation";
import { signOutAction } from "@/lib/account/actions";
import { THEMES, themeIcons, useThemeChoice } from "./theme-controls";
import type { ShellUser } from "./types";
import { UserAvatar } from "./user-avatar";

/** The user chip in the top bar and the menu it opens. Hidden under 760 px (the drawer has the same items). */
export function UserMenu({ user }: { user: ShellUser }) {
  const t = useTranslations("shell");
  const { value, choose } = useThemeChoice();
  const [, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("user.menu")}
        className="flex min-h-10 items-center gap-2.5 rounded-xl border border-border bg-card py-[5px] ps-3 pe-[5px] outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted max-[760px]:hidden"
      >
        <span className="text-start leading-tight max-lg:hidden">
          <span className="block max-w-[180px] truncate text-[13.5px] font-medium">
            {user.name}
          </span>
          <span className="block max-w-[180px] truncate text-[11.5px] text-fg-3">
            {user.jobTitle}
          </span>
        </span>
        <UserAvatar name={user.name} />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="w-64 p-1.5">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-2.5 px-2 py-2">
            <UserAvatar name={user.name} className="size-9" />
            <span className="min-w-0 text-start">
              <span className="block truncate text-sm font-semibold text-foreground">
                {user.name}
              </span>
              <span className="num block truncate text-xs font-normal text-muted-foreground">
                {user.email}
              </span>
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="min-h-9 px-2"
          render={<Link href="/profile" />}
        >
          <UserRound aria-hidden="true" />
          {t("user.profile")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2">{t("user.theme")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={value} onValueChange={choose}>
            {THEMES.map((id) => {
              const Icon = themeIcons[id];
              return (
                <DropdownMenuRadioItem key={id} value={id} className="min-h-9 ps-2">
                  <Icon aria-hidden="true" />
                  {t(`user.${id}`)}
                </DropdownMenuRadioItem>
              );
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="min-h-9 px-2"
          onClick={() => startTransition(() => signOutAction())}
        >
          <LogOut aria-hidden="true" className="rtl:-scale-x-100" />
          {t("user.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
