// Stripe service — Payment Intents (ACH for v1) + webhook verification.
// Operates in two modes:
//   - LIVE: STRIPE_SECRET_KEY is set → real Stripe API calls via fetch.
//   - STUB: no key → returns deterministic stub intents so the UI can render
//           in dev / preview without Stripe credentials. Stub intents will
//           never actually charge anyone; they're for the demo flow only.

import crypto from "crypto";

type CreateIntentArgs = {
  amount: number;          // dollars
  currency?: string;        // default usd
  method?: "ach" | "card";  // default ach
  invoiceId: string;
  tenantId: string;
  customerEmail?: string;
};

type PaymentIntent = {
  id: string;
  client_secret: string;
  status: string;
  amount: number;
  currency: string;
  metadata: Record<string, string>;
};

const STRIPE_API = "https://api.stripe.com/v1";

function isLive(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

function authHeader(): string {
  return `Bearer ${process.env.STRIPE_SECRET_KEY}`;
}

function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

function paymentMethodTypes(method: "ach" | "card"): string[] {
  return method === "ach" ? ["us_bank_account"] : ["card"];
}

export async function createPaymentIntent(args: CreateIntentArgs): Promise<PaymentIntent> {
  const { amount, currency = "usd", method = "ach", invoiceId, tenantId, customerEmail } = args;

  if (!isLive()) {
    // Stub mode — return a synthetic intent so the client can render.
    const id = `pi_stub_${crypto.randomBytes(8).toString("hex")}`;
    const client_secret = `${id}_secret_${crypto.randomBytes(8).toString("hex")}`;
    return {
      id,
      client_secret,
      status: "requires_payment_method",
      amount: toCents(amount),
      currency,
      metadata: { invoiceId, tenantId, method, stub: "1" },
    };
  }

  const body = new URLSearchParams();
  body.append("amount", String(toCents(amount)));
  body.append("currency", currency);
  for (const pmt of paymentMethodTypes(method)) body.append("payment_method_types[]", pmt);
  body.append("metadata[invoiceId]", invoiceId);
  body.append("metadata[tenantId]", tenantId);
  body.append("metadata[method]", method);
  if (customerEmail) body.append("receipt_email", customerEmail);

  const res = await fetch(`${STRIPE_API}/payment_intents`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const errTxt = await res.text();
    throw new Error(`Stripe create intent failed: ${res.status} ${errTxt.slice(0, 200)}`);
  }
  const json = (await res.json()) as PaymentIntent;
  return json;
}

// Stripe webhook signature verification.
// Implements t=...,v1=... HMAC-SHA256 of `${timestamp}.${rawBody}` using STRIPE_WEBHOOK_SECRET.
// Falls back to "trust but log" in stub mode (no STRIPE_WEBHOOK_SECRET set).
export function computeStripeSignature(payload: string, secret: string, timestamp: number): string {
  const signedPayload = `${timestamp}.${payload}`;
  return crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");
}

export async function handleStripeWebhook(rawBody: string | Buffer, sigHeader?: string): Promise<any> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const payload = typeof rawBody === "string" ? rawBody : rawBody.toString("utf-8");

  if (secret && sigHeader) {
    const parts = sigHeader.split(",").map(p => p.split("="));
    const t = parts.find(p => p[0] === "t")?.[1];
    const sigs = parts.filter(p => p[0] === "v1").map(p => p[1]);
    if (!t || sigs.length === 0) {
      throw new Error("Stripe-Signature header malformed");
    }
    const expected = computeStripeSignature(payload, secret, Number(t));
    const ok = sigs.some(s => {
      try {
        return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(s, "hex"));
      } catch { return false; }
    });
    if (!ok) throw new Error("Stripe-Signature mismatch");
  } else {
    // Stub mode — log and accept. NEVER do this in production with secret set.
    if (process.env.NODE_ENV === "production" && !secret) {
      console.warn("[stripe] STRIPE_WEBHOOK_SECRET not set in production — accepting unverified");
    }
  }

  try {
    return JSON.parse(payload);
  } catch {
    throw new Error("webhook body not valid JSON");
  }
}

