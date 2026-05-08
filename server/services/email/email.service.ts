/**
 * Vendor-agnostic email service.
 *
 * - If RESEND_API_KEY is set, sends real emails via Resend.
 * - If unset, logs the email payload to console (dev/dark-launch mode) so
 *   the rest of the pipeline (invitation creation, token generation,
 *   approval routing) can be exercised without a real provider.
 *
 * The default sender is bids@blackhawkconst.com. Override via EMAIL_FROM
 * env var if needed.
 *
 * IMPORTANT: never put the API key in code or in .replit's [env] section.
 * Set RESEND_API_KEY only via Replit Secrets.
 */

import { Resend } from "resend";

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  tags?: { name: string; value: string }[];
}

export interface SendEmailResult {
  ok: boolean;
  provider: "resend" | "console";
  messageId?: string;
  error?: string;
}

const FROM = process.env.EMAIL_FROM || "BLACKHAWK Bids <bids@blackhawkconst.com>";

let resendClient: Resend | null = null;
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!resendClient) resendClient = new Resend(key);
  return resendClient;
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const client = getResend();
  const recipients = Array.isArray(params.to) ? params.to.join(", ") : params.to;

  if (!client) {
    // Dev / dark-launch mode: log instead of send.
    console.log(
      `[email.service][DRY-RUN no RESEND_API_KEY] to=${recipients} subject="${params.subject}"`
    );
    console.log(`[email.service][DRY-RUN body preview]\n${params.text || params.html.slice(0, 500)}`);
    return { ok: true, provider: "console" };
  }

  try {
    const result = await client.emails.send({
      from: FROM,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      replyTo: params.replyTo,
      cc: params.cc,
      bcc: params.bcc,
      tags: params.tags,
    });
    if (result.error) {
      console.error("[email.service] Resend returned error:", result.error);
      return { ok: false, provider: "resend", error: String(result.error) };
    }
    console.log(`[email.service] sent id=${result.data?.id} to=${recipients}`);
    return { ok: true, provider: "resend", messageId: result.data?.id };
  } catch (err: any) {
    console.error("[email.service] send threw:", err?.message || err);
    return { ok: false, provider: "resend", error: err?.message || String(err) };
  }
}

export function emailServiceConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}
