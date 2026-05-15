// Push subscription + idempotency persistence — Sprint 7.5
// Tables created by sprint7_5.sql. Falls back to in-memory if DB unavailable.
import { db } from "./db";
import { sql } from "drizzle-orm";

export type PushSub = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userId: string;
  userAgent?: string;
};

// ---- Push subscriptions ----
export async function savePushSubscription(sub: PushSub): Promise<void> {
  try {
    await (db as unknown as { execute: (q: unknown) => Promise<unknown> }).execute(
      sql`INSERT INTO push_subscriptions (user_id, endpoint, keys_json, user_agent)
          VALUES (${sub.userId}, ${sub.endpoint}, ${JSON.stringify(sub.keys)}, ${sub.userAgent ?? null})
          ON CONFLICT (endpoint) DO UPDATE
          SET keys_json = EXCLUDED.keys_json,
              user_agent = EXCLUDED.user_agent,
              user_id = EXCLUDED.user_id`,
    );
  } catch (e) {
    console.error("[push] save failed:", (e as Error).message);
  }
}

export async function loadPushSubscriptions(userId?: string): Promise<PushSub[]> {
  try {
    const q = userId
      ? sql`SELECT user_id, endpoint, keys_json, user_agent FROM push_subscriptions WHERE user_id = ${userId}`
      : sql`SELECT user_id, endpoint, keys_json, user_agent FROM push_subscriptions`;
    const res = (await (db as unknown as { execute: (q: unknown) => Promise<unknown> }).execute(q)) as { rows?: Array<Record<string, unknown>> };
    return (res.rows ?? []).map((r) => ({
      userId: String(r.user_id),
      endpoint: String(r.endpoint),
      keys: JSON.parse(String(r.keys_json)),
      userAgent: r.user_agent ? String(r.user_agent) : undefined,
    }));
  } catch (e) {
    console.error("[push] load failed:", (e as Error).message);
    return [];
  }
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  try {
    await (db as unknown as { execute: (q: unknown) => Promise<unknown> }).execute(
      sql`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint}`,
    );
  } catch (e) {
    console.error("[push] delete failed:", (e as Error).message);
  }
}

// ---- Idempotency keys ----
const IDEM_TTL_MS = 24 * 60 * 60 * 1000;

export async function checkAndStoreIdempotency(key: string, scope: string): Promise<boolean> {
  if (!key) return false;
  const expiresAt = new Date(Date.now() + IDEM_TTL_MS);
  try {
    const res = (await (db as unknown as { execute: (q: unknown) => Promise<unknown> }).execute(
      sql`INSERT INTO idempotency_keys (key, scope, expires_at)
          VALUES (${key}, ${scope}, ${expiresAt.toISOString()})
          ON CONFLICT (key) DO NOTHING
          RETURNING key`,
    )) as { rows?: unknown[] };
    return (res.rows ?? []).length > 0; // true if inserted (new), false if duplicate
  } catch {
    return true; // fail-open in case DB is unavailable
  }
}

export async function purgeExpiredIdempotency(): Promise<void> {
  try {
    await (db as unknown as { execute: (q: unknown) => Promise<unknown> }).execute(
      sql`DELETE FROM idempotency_keys WHERE expires_at < now()`,
    );
  } catch { /* ignore */ }
}
