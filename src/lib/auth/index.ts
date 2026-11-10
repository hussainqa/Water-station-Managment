import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { authDb, authSchema } from "./db";
import { sendMail } from "./mailer";

/**
 * Better Auth: email + password, sessions in Postgres, reset by email.
 * Uses its own database role (see ./db.ts); email verification is off.
 */
export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(authDb, { provider: "pg", schema: authSchema }),
  advanced: { database: { generateId: "uuid" } },
  user: {
    additionalFields: {
      jobTitle: { type: "string", required: true, input: true },
      locale: {
        type: "string",
        required: false,
        defaultValue: "ar",
        input: true,
      },
      theme: {
        type: "string",
        required: false,
        defaultValue: "system",
        input: true,
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    requireEmailVerification: false,
    sendResetPassword: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: "إعادة تعيين كلمة المرور · Reset your password",
        text: [
          "لإعادة تعيين كلمة المرور افتح الرابط التالي:",
          url,
          "إذا لم تطلب ذلك فتجاهل هذه الرسالة.",
          "",
          "To reset your password, open this link:",
          url,
          "If you did not request this, ignore this message.",
        ].join("\n"),
      });
    },
  },
  // Must stay last: lets server actions set the session cookie.
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
export type SessionUser = Session["user"];
