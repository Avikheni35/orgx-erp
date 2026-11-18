import nodemailer from 'nodemailer';
import { env } from '../config/env';

function createTransport() {
  if (!env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
}

const transport = createTransport();

interface Attachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: Attachment[];
}

export async function sendEmail(options: EmailOptions): Promise<void> {
  if (!transport) {
    console.log(`[M3 Email] To: ${options.to}\nSubject: ${options.subject}\nAttachments: ${options.attachments?.map(a => a.filename).join(', ') || 'none'}\n${options.html}`);
    return;
  }
  await transport.sendMail({ from: env.EMAIL_FROM, ...options });
}
