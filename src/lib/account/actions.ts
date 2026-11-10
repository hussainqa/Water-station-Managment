"use server";

import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { auth } from "@/lib/auth";
import { requireUser } from "@/lib/auth/session";

const localeSchema = z.enum(["ar", "en"]);
const themeSchema = z.enum(["light", "dark", "system"]);

/** Saves the interface language on the user's profile. */
export async function setLocaleAction(input: unknown): Promise<{ ok: boolean }> {
  await requireUser();
  const parsed = localeSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  try {
    await auth.api.updateUser({
      body: { locale: parsed.data },
      headers: await headers(),
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** Saves the theme choice on the user's profile. */
export async function setThemeAction(input: unknown): Promise<{ ok: boolean }> {
  await requireUser();
  const parsed = themeSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  try {
    await auth.api.updateUser({
      body: { theme: parsed.data },
      headers: await headers(),
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** Ends the session and returns to the login page in the current locale. */
export async function signOutAction(): Promise<void> {
  await requireUser();
  await auth.api.signOut({ headers: await headers() });
  return redirect({ href: "/login", locale: await getLocale() });
}
