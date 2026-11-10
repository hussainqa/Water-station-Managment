import "server-only";
import nodemailer from "nodemailer";

// Mailpit locally (docker-compose.yml); any SMTP server via env in production.
const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? "localhost",
  port: Number(process.env.SMTP_PORT ?? 54325),
  secure: process.env.SMTP_SECURE === "true",
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? "" }
    : undefined,
});

export async function sendMail(message: {
  to: string;
  subject: string;
  text: string;
}) {
  await transport.sendMail({
    from: process.env.SMTP_FROM ?? "WTP-SQMS <no-reply@wtp.local>",
    ...message,
  });
}
