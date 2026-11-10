import * as z from "zod";

/**
 * Shared by the server actions and the client forms.
 * Messages are translation codes (auth.errors.<code>), never display text.
 */
export type FieldErrorCode =
  | "nameRequired"
  | "jobTitleRequired"
  | "emailRequired"
  | "emailInvalid"
  | "passwordRequired"
  | "passwordShort"
  | "passwordMismatch"
  | "emailTaken";

const email = z
  .string()
  .trim()
  .min(1, "emailRequired")
  .pipe(z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "emailInvalid"));

const newPassword = z.string().min(8, "passwordShort").max(128, "passwordShort");

const name = z.string().trim().min(1, "nameRequired").max(120, "nameRequired");
const jobTitle = z
  .string()
  .trim()
  .min(1, "jobTitleRequired")
  .max(120, "jobTitleRequired");

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "passwordRequired"),
});

export const signUpSchema = z
  .object({
    name,
    jobTitle,
    email,
    password: newPassword,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "passwordMismatch",
  });

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: newPassword,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "passwordMismatch",
  });

export const profileSchema = z.object({ name, jobTitle });

export type FieldErrors = Partial<Record<string, FieldErrorCode>>;

/** Flatten a Zod error to the first code per field. */
export function fieldErrorsFromZod(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in out)) out[key] = issue.message as FieldErrorCode;
  }
  return out;
}

export type FormErrorCode =
  | "invalidCredentials"
  | "invalidToken"
  | "validation"
  | "generic";

export type ActionResult =
  | { ok: true }
  | {
      ok: false;
      error: FormErrorCode;
      fieldErrors?: FieldErrors;
      /** Non-secret submitted values, so the form can refill after the action resets it. */
      values?: Record<string, string>;
    };
