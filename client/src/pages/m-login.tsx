/**
 * Sprint TK1 — Mobile Login Page
 *
 * Passwordless email-based sign-in for the field PWA. Submits to
 * POST /api/auth/mobile-login, stores the returned userId in localStorage,
 * and redirects to /m-home. The offline-queue's apiFetch reads this id from
 * localStorage and injects it as the `x-sentinel-user` header on every write,
 * which the server's mobileAuthMiddleware honors.
 *
 * Route: /m-login
 *
 * Notes:
 * - We deliberately do NOT block on /api/auth/mobile-session at app boot;
 *   the gate is enforced server-side. The client only redirects to here
 *   when an API call comes back 401.
 * - "Remember me" is implicit — sessions are persisted to localStorage
 *   and survive PWA cold-starts. There is no expiry today; that's a TK-future.
 */

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { LogIn, AlertTriangle } from "lucide-react";
import { SafeArea } from "@/components/ui/safe-area";

const STORAGE_USER_ID = "sentinel-user-id";
const STORAGE_USER_NAME = "sentinel-user-name";
const STORAGE_USER_EMAIL = "sentinel-user-email";

export default function MobileLoginPage() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If we already have a stored session, bounce straight through. Most users
  // won't see this page after the first sign-in.
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_USER_ID);
    if (!stored) return;
    // Validate against the server. If it 401s, clear and stay on login.
    fetch("/api/auth/mobile-session", { headers: { "x-sentinel-user": stored } })
      .then((r) => {
        if (r.ok) {
          setLocation("/m-home");
        } else {
          localStorage.removeItem(STORAGE_USER_ID);
          localStorage.removeItem(STORAGE_USER_NAME);
          localStorage.removeItem(STORAGE_USER_EMAIL);
        }
      })
      .catch(() => {
        // Offline — trust the local session and proceed. If it's truly
        // invalid, the next API call will 401 and bounce back here.
        setLocation("/m-home");
      });
  }, [setLocation]);

  const submit = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Enter your email.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const r = await fetch("/api/auth/mobile-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      if (!r.ok) {
        let msg = `Sign-in failed (HTTP ${r.status})`;
        try {
          const j = await r.json();
          if (j?.error) msg = j.error;
        } catch {
          // ignore
        }
        setError(msg);
        return;
      }
      const data = (await r.json()) as {
        userId: string;
        email: string;
        displayName?: string;
      };
      localStorage.setItem(STORAGE_USER_ID, data.userId);
      localStorage.setItem(STORAGE_USER_EMAIL, data.email);
      if (data.displayName) localStorage.setItem(STORAGE_USER_NAME, data.displayName);
      setLocation("/m-home");
    } catch (e) {
      setError((e as Error)?.message || "Network error. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeArea sides={["top", "bottom"]} className="min-h-screen bg-slate-950 text-slate-100">
      <div className="px-6 py-12 max-w-sm mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Sentinel</h1>
          <p className="mt-1 text-xs uppercase tracking-wider text-emerald-400">Field</p>
        </div>

        <label htmlFor="m-login-email" className="block text-xs uppercase tracking-wide text-slate-400 mb-1">
          Email
        </label>
        <input
          id="m-login-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="off"
          autoCorrect="off"
          autoFocus
          className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-sm mb-4 focus:outline-none focus:border-emerald-600"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />

        {error && (
          <div className="mb-3 flex items-start gap-2 rounded bg-rose-950/40 border border-rose-900/60 px-3 py-2 text-xs text-rose-300">
            <AlertTriangle size={14} className="mt-[2px] shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          onClick={submit}
          disabled={loading || !email.trim()}
          className="w-full rounded-lg bg-emerald-700 hover:bg-emerald-600 px-3 py-2 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <LogIn size={14} />
          {loading ? "Signing in…" : "Sign in"}
        </button>

        <p className="mt-6 text-[10px] text-slate-500 leading-relaxed">
          Sign-in by email. No password yet. Real auth (magic link + TOTP) ships
          in a later sprint. Your session is stored on this device only.
        </p>
      </div>
    </SafeArea>
  );
}
