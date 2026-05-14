// Web Push helpers — VAPID-based browser push subscription.

function urlBase64ToUint8Array(b64: string): Uint8Array {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;
}

export async function currentPermission(): Promise<NotificationPermission> {
  if (!pushSupported()) return "denied";
  return Notification.permission;
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  try {
    if (!pushSupported()) return null;
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch { return null; }
}

async function fetchVapidKey(): Promise<string | null> {
  try {
    const r = await fetch("/api/push/vapid-public-key");
    if (!r.ok) return null;
    const j = (await r.json()) as { publicKey: string | null };
    return j.publicKey || null;
  } catch { return null; }
}

export async function subscribePush(): Promise<{ ok: boolean; reason?: string; sub?: PushSubscription }> {
  if (!pushSupported()) return { ok: false, reason: "Push not supported on this device." };
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: "Notifications were not allowed." };
  const key = await fetchVapidKey();
  if (!key) return { ok: false, reason: "Server VAPID key missing." };
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub = existing || await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key),
  });
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  const r = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  });
  if (!r.ok) return { ok: false, reason: "Server rejected subscription." };
  return { ok: true, sub };
}

export async function unsubscribePush(): Promise<{ ok: boolean }> {
  try {
    const sub = await getExistingSubscription();
    if (!sub) return { ok: true };
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    });
    return { ok: true };
  } catch { return { ok: false }; }
}

export async function sendTestPush(): Promise<{ sent: number; failed: number } | null> {
  try {
    const r = await fetch("/api/push/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!r.ok) return null;
    return (await r.json()) as { sent: number; failed: number };
  } catch { return null; }
}
