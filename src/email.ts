import nodemailer from 'nodemailer';
import { config } from './config.js';

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

function canSendRealEmail(): boolean {
  return Boolean(config.smtp.host && config.smtp.fromEmail);
}

function redactEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '[redacted]';
  const maskedLocal = local.length <= 2 ? `${local[0] ?? ''}*` : `${local.slice(0, 2)}***`;
  return `${maskedLocal}@${domain}`;
}

export async function sendEmail(msg: EmailMessage): Promise<void> {
  if (!canSendRealEmail()) {
    // eslint-disable-next-line no-console
    console.log('[email:dev]', { to: redactEmail(msg.to), subject: msg.subject, text: msg.text, html: msg.html });
    return;
  }

  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    // Prevent hanging requests if the SMTP endpoint is unreachable or stalls.
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 10_000
  });

  await transporter.sendMail({
    from: config.smtp.fromName ? `"${config.smtp.fromName}" <${config.smtp.fromEmail}>` : config.smtp.fromEmail,
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    html: msg.html
  });
}
