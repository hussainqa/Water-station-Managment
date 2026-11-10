"use client";

import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { signOutAction } from "@/lib/account/actions";
import { navItemClass } from "./nav-list";

/** Sign-out entry for the sidebar / drawer footer. */
export function SignOutButton() {
  const t = useTranslations("shell");
  return (
    <form action={signOutAction}>
      <button type="submit" className={navItemClass}>
        <LogOut
          aria-hidden="true"
          className="text-muted-foreground rtl:-scale-x-100"
        />
        <span>{t("user.signOut")}</span>
      </button>
    </form>
  );
}
