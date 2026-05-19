/**
 * Sprint M-FINAL-3: Magic link auth.
 *
 * Real auth replacing Sprint TK1's passwordless lookup. Flow:
 *   1. POST /api/auth/magic-link/request {email}
 *      → If user is active, generates a 32-byte token, stores it with 15-min
 *        expiry, and emails the user a sign-in link. Always returns 200
 *        (no info leak about which emails exist).
 *   2. GET  /api/auth/magic-link/verify?token=X
 *      → If token exists, unused, unexpired: marks consumed, returns
 *        {userId, email, displayName}. Client stores userId in localStorage.
 *
 * Email delivery: if SMTP_URL env is set, sends via nodemailer (dynamic import);
 * otherwise logs the link to console (dev mode).
 */
import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";

export const magicLinkRouter = Router();
const TOKEN_TTL_MIN = 15;

let bootstrapped = false;
async function ensureTable(): Promise<void> {
  if (bootstrapped) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS magic_links (
      token       varchar(64) PRIMARY KEY,
      user_id     varchar(36) NOT NULL,
      email       varchar(320) NOT NULL,
      expires_at  timestamptz NOT NULL,
      consumed_at timestamptz,
      created_at  timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS magic_links_email_idx ON magic_links (email)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS magic_links_exp_idx ON magic_links (expires_at)`);
  bootstrapped = true;
}
void ensureTable().catch((e) => console.error("[magic-link] bootstrap:", e));

magicLinkRouter.use(async (_req, _res, next) => {
  if (!bootstrapped) await ensureTable();
  next();
});

async function cleanupExpired(): Promise<void> {
  try { await pool.query("DELETE FROM magic_links WHERE expires_at < now() - interval '1 hour'"); } catch {}
}

async function sendMagicLink(email: string, link: string): Promise<{ delivered: "smtp" | "console" }> {
  const smtpUrl = process.env.SMTP_URL || process.env.SENDGRID_SMTP_URL;
  if (smtpUrl) {
    try {
      // @ts-ignore — optional dep
      const nm: any = await import("nodemailer").catch(() => null);
      if (nm) {
        const transport = nm.createTransport(smtpUrl);
        await transport.sendMail({
          from: process.env.MAIL_FROM || "no-reply@sentinel-command-center.app",
          to: email,
          subject: "Your Sentinel sign-in link",
          text: "Click to sign in: " + link + "\n\nThis link expires in " + TOKEN_TTL_MIN + " minutes.",
        });
        return { delivered: "smtp" };
      }
    } catch (e) {
      console.error("[magic-link] SMTP send failed, falling back to console:", e);
    }
  }
  console.log("[magic-link] (dev) Sign-in link for " + email + ": " + link);
  return { delivered: "console" };
}

const requestSchema = z.object({ email: z.string().email().max(320) });

magicLinkRouter.post("/request", async (req: Request, res: Response) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Valid email required" });
  const email = parsed.data.email.trim().toLowerCase();
  try {
    void cleanupExpired();
    const result = await db.execute(sql`
      SELECT id, email FROM users WHERE LOWER(email) = ${email} AND status = 'active' LIMIT 1
    `);
    const user = result.rows?.[0] as { id: string; email: string } | undefined;
    if (!user) return res.status(200).json({ ok: true, hint: "If your email is registered, a link is on its way" });
    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MIN * 60_000).toISOString();
    await pool.query("INSERT INTO magic_links (token, user_id, email, expires_at) VALUES ($1, $2, $3, $4)", [token, user.id, user.email, expiresAt]);
    const baseUrl = (req.headers.origin as string) || (req.protocol + "://" + req.get("host"));
    const link = baseUrl + "/m-login?token=" + token;
    const send = await sendMagicLink(user.email, link);
    res.json({ ok: true, delivered: send.delivered });
  } catch (e: any) {
    console.error("[magic-link] /request:", e);
    res.status(500).json({ error: "Could not generate link" });
  }
});

magicLinkRouter.get("/verify", async (req: Request, res: Response) => {
  const token = String(req.query.token || "").trim();
  if (!token || token.length < 16 || token.length > 64) return res.status(400).json({ error: "Invalid token" });
  try {
    const result = await pool.query(
      "SELECT m.token, m.user_id, m.email, m.expires_at, m.consumed_at, u.display_name FROM magic_links m JOIN users u ON u.id = m.user_id AND u.status = 'active' WHERE m.token = $1 LIMIT 1",
      [token],
    );
    const row = result.rows?.[0] as { token: string; user_id: string; email: string; expires_at: string; consumed_at: string | null; display_name: string | null } | undefined;
    if (!row) return res.status(404).json({ error: "Link invalid or already used" });
    if (row.consumed_at) return res.status(401).json({ error: "Link already used" });
    if (new Date(row.expires_at).getTime() < Date.now()) return res.status(401).json({ error: "Link expired" });
    await pool.query("UPDATE magic_links SET consumed_at = now() WHERE token = $1", [token]);
    res.json({ userId: row.user_id, email: row.email, displayName: row.display_name || row.email });
  } catch (e: any) {
    console.error("[magic-link] /verify:", e);
    res.status(500).json({ error: "Verification failed" });
  }
});

export default magicLinkRouter;
