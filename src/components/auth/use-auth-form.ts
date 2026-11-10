"use client";

import { useActionState, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import type * as z from "zod";
import {
  fieldErrorsFromZod,
  type ActionResult,
  type FieldErrors,
} from "@/lib/auth/schemas";

type Action = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

/**
 * Wires a server action to a form: pending state, client-side validation with the
 * same Zod schema the server uses, and translated field / form errors.
 */
export function useAuthForm(action: Action, schema: z.ZodType) {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    action,
    null,
  );
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});

  const failed = state && !state.ok ? state : null;
  const errors: FieldErrors =
    Object.keys(clientErrors).length > 0 ? clientErrors : (failed?.fieldErrors ?? {});

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    const fd = new FormData(e.currentTarget);
    const result = schema.safeParse(Object.fromEntries(fd));
    if (!result.success) {
      e.preventDefault();
      const next = fieldErrorsFromZod(result.error);
      setClientErrors(next);
      const first = Object.keys(next)[0];
      e.currentTarget
        .querySelector<HTMLElement>(`[name="${first}"]`)
        ?.focus();
    } else {
      setClientErrors({});
    }
  }

  return {
    formAction,
    onSubmit,
    pending,
    ok: state?.ok === true,
    values: failed?.values ?? {},
    fieldError: (name: string) => {
      const code = errors[name];
      return code ? t(`errors.${code}`) : undefined;
    },
    /** Form-level message (not field-level validation). */
    formError:
      failed && failed.error !== "validation" ? t(`errors.${failed.error}`) : undefined,
    formErrorCode: failed?.error,
  };
}
