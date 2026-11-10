import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { auth, type SessionUser } from "./index";

/** The current session, or null. Cached for the duration of one request. */
export const getSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);

/**
 * The signed-in user, or a redirect to the login page.
 * The returned id is what you pass to withUser().
 */
export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) {
    return redirect({ href: "/login", locale: await getLocale() });
  }
  return session.user;
}
