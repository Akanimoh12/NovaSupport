import nodemailer from "nodemailer";
import { logger } from "./logger.js";

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

const DEFAULT_FROM = "NovaSupport <noreply@novasupport.xyz>";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: process.env.SMTP_SECURE === "true",
  auth:
    process.env.SMTP_USER && process.env.SMTP_PASS
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
});

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  if (!process.env.SMTP_HOST) {
    return Promise.reject(new Error("SMTP_HOST is not configured — email cannot be sent"));
  }

  await transporter.sendMail({
    ...options,
    from: process.env.SMTP_FROM ?? DEFAULT_FROM,
  });
}
