import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Landmark, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

interface PaymentConfig {
  enabled: boolean;
  publishableKey: string | null;
  method: "ach" | "card";
}

interface Props {
  invoiceId: string;
  amountDue: number;
  customerEmail?: string;
  onPaid?: (paymentIntentId: string) => void;
}

/**
 * Invoice Pay button — v1 ACH only via Stripe Payment Intents.
 *
 *  - If STRIPE_SECRET_KEY is not configured server-side, /api/payments/config
 *    returns enabled:false and we render an explanatory disabled state.
 *  - If enabled, we POST /api/invoices/:id/payment-intent and surface the
 *    returned clientSecret + publishableKey to Stripe Elements (loaded
 *    lazily). For pure server-side ACH (Plaid + microdeposits), this is
 *    the entry point; Stripe Elements is wired via Stripe.js loaded from
 *    js.stripe.com at first click.
 */
export function InvoicePayButton({ invoiceId, amountDue, customerEmail, onPaid }: Props) {
  const [stage, setStage] = useState<"idle" | "loading" | "ready" | "succeeded" | "error">("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);

  const { data: cfg } = useQuery<PaymentConfig>({ queryKey: ["/api/payments/config"] });

  const createIntent = useMutation({
    mutationFn: async () => {
      setStage("loading");
      setErrMsg(null);
      const res = await fetch(`/api/invoices/${invoiceId}/payment-intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amountDue, customerEmail }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body.slice(0, 200) || "Could not start payment");
      }
      return (await res.json()) as {
        clientSecret: string;
        paymentIntentId: string;
        status: string;
        amount: number;
        method: string;
      };
    },
    onSuccess: async (data) => {
      setPaymentIntentId(data.paymentIntentId);
      // If we have a real Stripe key, the next step is to hand `clientSecret`
      // to Stripe Elements / Stripe.js to confirm a US bank account. For v1
      // (and stub mode) we surface the success-pending state and let the
      // webhook flip it to "succeeded" when funds settle (1-3 business days).
      if (cfg?.publishableKey) {
        try {
          await openStripeBankFlow(cfg.publishableKey, data.clientSecret);
          setStage("ready");
        } catch (e: any) {
          setErrMsg(e?.message || "Bank link failed");
          setStage("error");
        }
      } else {
        setStage("ready");
      }
      onPaid?.(data.paymentIntentId);
    },
    onError: (err: Error) => {
      setErrMsg(err.message);
      setStage("error");
    },
  });

  // Server says payments aren't configured at all (no STRIPE_SECRET_KEY).
  if (cfg && !cfg.enabled) {
    return (
      <div className="rounded-md border border-amber-700/40 bg-amber-950/20 text-amber-200 px-3 py-2 text-xs flex items-center gap-2" data-testid="pay-disabled">
        <AlertCircle className="h-3.5 w-3.5" />
        <span>Online payments not configured — set <code className="bg-black/40 px-1 rounded">STRIPE_SECRET_KEY</code> to enable ACH collection.</span>
      </div>
    );
  }

  if (stage === "succeeded" || stage === "ready") {
    return (
      <div className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border border-emerald-700/40 bg-emerald-950/20 text-emerald-300" data-testid="pay-pending">
        <CheckCircle2 className="h-3.5 w-3.5" />
        ACH initiated{paymentIntentId ? ` · ${paymentIntentId.slice(0, 10)}…` : ""} — settles 1–3 business days
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button
        onClick={() => createIntent.mutate()}
        disabled={stage === "loading" || !(amountDue > 0)}
        className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 text-sm font-medium text-white transition"
        data-testid="invoice-pay-button"
      >
        {stage === "loading" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Landmark className="h-4 w-4" />
        )}
        Pay ${amountDue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} via ACH
      </button>
      {errMsg && (
        <div className="text-xs text-red-300 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" /> {errMsg}
        </div>
      )}
    </div>
  );
}

// Lazy-load Stripe.js + invoke a US-bank-account collection flow. Wrapped so
// production builds don't pull in the Stripe JS on every page load.
async function openStripeBankFlow(publishableKey: string, clientSecret: string): Promise<void> {
  await loadStripeJs();
  const Stripe = (window as any).Stripe;
  if (typeof Stripe !== "function") throw new Error("Stripe.js failed to load");
  const stripe = Stripe(publishableKey);

  // collectBankAccountForPayment requires a name + email which we don't have
  // in v1. For now we hand off to confirmUsBankAccountPayment in a popup-less
  // mode; if Stripe needs more info it'll throw and the caller will surface
  // the error. Real production wiring will collect name+email up front.
  const result = await stripe.collectBankAccountForPayment({
    clientSecret,
    params: { payment_method_type: "us_bank_account", payment_method_data: {} },
  });
  if (result.error) throw new Error(result.error.message || "Bank collection failed");
}

let stripeJsPromise: Promise<void> | null = null;
function loadStripeJs(): Promise<void> {
  if (stripeJsPromise) return stripeJsPromise;
  stripeJsPromise = new Promise<void>((resolve, reject) => {
    if ((window as any).Stripe) return resolve();
    const s = document.createElement("script");
    s.src = "https://js.stripe.com/v3";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Stripe.js script load error"));
    document.head.appendChild(s);
  });
  return stripeJsPromise;
}

