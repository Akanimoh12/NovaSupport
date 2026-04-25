import { sendEmail } from "../mailer.js";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

export async function sendVerificationEmail(
  to: string,
  username: string,
  token: string,
): Promise<void> {
  const verifyUrl = `${APP_URL}/profiles/${encodeURIComponent(username)}/verify-email?token=${encodeURIComponent(token)}`;

  const html = `
    <h2>Verify your NovaSupport email address</h2>
    <p>Hi ${username},</p>
    <p>Please verify your email address by clicking the link below. The link expires in 24 hours.</p>
    <p><a href="${verifyUrl}" style="display:inline-block;padding:10px 20px;background:#6366f1;color:#fff;text-decoration:none;border-radius:6px;">Verify email address</a></p>
    <p>Or paste this URL into your browser:<br><code>${verifyUrl}</code></p>
    <p>If you did not request this, you can safely ignore this message.</p>
    <br/>
    <p>Thanks,<br/>The NovaSupport Team</p>
  `.trim();

  await sendEmail({
    to,
    subject: "Verify your NovaSupport email address",
    html,
    text: `Hi ${username},\n\nVerify your email address:\n${verifyUrl}\n\nThis link expires in 24 hours.\n\nIf you did not request this, ignore this message.`,
  });
}
