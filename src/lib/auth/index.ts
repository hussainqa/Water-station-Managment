import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db/client";
import { accounts, sessions, users, verifications } from "@/db/schema";
import { sendMail } from "./mailer";

/**
 * Better Auth: email + password, sessions in Postgres, reset by email.
 * Runs on the restricted app role like everything else in src/.
 */
export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
    },
  }),
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
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    sendResetPassword: async ({ user, url }) => {
      // Bilingual until Phase 1 picks the user's locale for the template.
      await sendMail({
        to: user.email,
        subject: "إعادة تعيين كلمة المرور · Reset your password",
        text: `لإعادة تعيين كلمة المرور افتح الرابط التالي:\n${url}\n\nTo reset your password, open this link:\n${url}\n`,
      });
    },
  },
});

export type Session = typeof auth.$Infer.Session;
