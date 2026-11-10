"use server";

import { APIError } from "better-auth/api";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { auth } from "./index";
import { requireUser } from "./session";
import {
  fieldErrorsFromZod,
  forgotPasswordSchema,
  profileSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  type ActionResult,
} from "./schemas";

// useActionState passes the previous result first; the forms ignore it.
type Prev = ActionResult | null;

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

function localeOf(fd: FormData): Locale {
  const v = str(fd, "locale");
  return (routing.locales as readonly string[]).includes(v)
    ? (v as Locale)
    : routing.defaultLocale;
}

function errorCode(e: unknown): string | undefined {
  if (e instanceof APIError) {
    const code = (e.body as { code?: string } | undefined)?.code;
    return code ?? String(e.status);
  }
  return undefined;
}

export async function signIn(_prev: Prev, fd: FormData): Promise<ActionResult> {
  const values = { email: str(fd, "email") };
  const parsed = signInSchema.safeParse({
    email: values.email,
    password: str(fd, "password"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation",
      fieldErrors: fieldErrorsFromZod(parsed.error),
      values,
    };
  }

  let savedLocale: Locale = localeOf(fd);
  try {
    const res = await auth.api.signInEmail({
      body: { email: parsed.data.email, password: parsed.data.password },
      headers: await headers(),
    });
    const l = (res.user as { locale?: string | null }).locale;
    if (l && (routing.locales as readonly string[]).includes(l)) {
      savedLocale = l as Locale;
    }
  } catch (e) {
    const code = errorCode(e);
    if (code === "INVALID_EMAIL_OR_PASSWORD" || code === "401") {
      return { ok: false, error: "invalidCredentials", values };
    }
    return { ok: false, error: "generic", values };
  }
  return redirect({ href: "/dashboard", locale: savedLocale });
}

export async function signUp(_prev: Prev, fd: FormData): Promise<ActionResult> {
  const locale = localeOf(fd);
  const values = {
    name: str(fd, "name"),
    jobTitle: str(fd, "jobTitle"),
    email: str(fd, "email"),
  };
  const parsed = signUpSchema.safeParse({
    ...values,
    password: str(fd, "password"),
    confirmPassword: str(fd, "confirmPassword"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation",
      fieldErrors: fieldErrorsFromZod(parsed.error),
      values,
    };
  }

  try {
    await auth.api.signUpEmail({
      body: {
        name: parsed.data.name,
        email: parsed.data.email,
        password: parsed.data.password,
        jobTitle: parsed.data.jobTitle,
        locale,
      },
      headers: await headers(),
    });
  } catch (e) {
    const code = errorCode(e);
    if (code?.startsWith("USER_ALREADY_EXISTS")) {
      return {
        ok: false,
        error: "validation",
        fieldErrors: { email: "emailTaken" },
        values,
      };
    }
    return { ok: false, error: "generic", values };
  }
  return redirect({ href: "/dashboard", locale });
}

export async function requestPasswordReset(
  _prev: Prev,
  fd: FormData,
): Promise<ActionResult> {
  const locale = localeOf(fd);
  const values = { email: str(fd, "email") };
  const parsed = forgotPasswordSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation",
      fieldErrors: fieldErrorsFromZod(parsed.error),
      values,
    };
  }
  try {
    await auth.api.requestPasswordReset({
      body: { email: parsed.data.email, redirectTo: `/${locale}/reset-password` },
      headers: await headers(),
    });
  } catch {
    // Same neutral answer whatever happens, so nothing about the account leaks.
  }
  return { ok: true };
}

export async function resetPassword(
  _prev: Prev,
  fd: FormData,
): Promise<ActionResult> {
  const locale = localeOf(fd);
  const parsed = resetPasswordSchema.safeParse({
    token: str(fd, "token"),
    password: str(fd, "password"),
    confirmPassword: str(fd, "confirmPassword"),
  });
  if (!parsed.success) {
    const fieldErrors = fieldErrorsFromZod(parsed.error);
    if (fieldErrors.token) return { ok: false, error: "invalidToken" };
    return { ok: false, error: "validation", fieldErrors };
  }
  try {
    await auth.api.resetPassword({
      body: { newPassword: parsed.data.password, token: parsed.data.token },
      headers: await headers(),
    });
  } catch (e) {
    const code = errorCode(e);
    if (code === "INVALID_TOKEN" || code === "400") {
      return { ok: false, error: "invalidToken" };
    }
    return { ok: false, error: "generic" };
  }
  return redirect({ href: "/login?reset=1", locale });
}

export async function updateProfile(
  _prev: Prev,
  fd: FormData,
): Promise<ActionResult> {
  await requireUser();
  const values = { name: str(fd, "name"), jobTitle: str(fd, "jobTitle") };
  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation",
      fieldErrors: fieldErrorsFromZod(parsed.error),
      values,
    };
  }
  try {
    await auth.api.updateUser({
      body: { name: parsed.data.name, jobTitle: parsed.data.jobTitle },
      headers: await headers(),
    });
  } catch {
    return { ok: false, error: "generic", values };
  }
  // Re-render the page and the shell with the new name.
  revalidatePath("/", "layout");
  return { ok: true };
}
