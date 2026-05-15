// Real web-push delivery — Sprint 7.5
// Uses VAPID keys from PUSH_VAPID_PUBLIC / PUSH_VAPID_PRIVATE / PUSH_VAPID_SUBJECT.
// Gracefully no-ops if web-push isn't installed or keys aren't set.
import { loadPushSubscriptions, deletePushSubscription } from "./push-persistence";

type WebPushAPI = {
  setVapidDetails: (subject: string, pub: string, priv: string) => void;
  sendNotification: (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<unknown>;
};

let webpush: WebPushAPI | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  webpush = require("web-push") as WebPushAPI;
  const pub = process.env.PUSH_VAPID_PUBLIC ?? "";
  const priv = process.env.PUSH_VAPID_PRIVATE ?? "";
  const sub = process.env.PUSH_VAPID_SUBJECT ?? "mailto:noreply@sentinel-command.com";
  if (pub && priv) {
    webpush.setVapidDetails(sub, pub, priv);
  } else {
    console.warn("[push-notify] VAPID keys missing — push notifications disabled");
    webpush = null;
  }
} catch {
  console.warn("[push-notify] web-push not installed — push notifications disabled");
  webpush = null;
}

export type SentinelPush = {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
  data?: Record<string, unknown>;
};

export async function notifyUser(userId: string, payload: SentinelPush): Promise<{ delivered: number; failed: number }> {
  if (!webpush) return { delivered: 0, failed: 0 };
  const subs = await loadPushSubscriptions(userId);
  let delivered = 0, failed = 0;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush!.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify(payload),
        );
        delivered++;
      } catch (e: unknown) {
        failed++;
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await deletePushSubscription(sub.endpoint);
        }
      }
    }),
  );
  return { delivered, failed };
}

export async function notifyAll(payload: SentinelPush): Promise<{ delivered: number; failed: number }> {
  if (!webpush) return { delivered: 0, failed: 0 };
  const subs = await loadPushSubscriptions();
  let delivered = 0, failed = 0;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush!.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify(payload),
        );
        delivered++;
      } catch (e: unknown) {
        failed++;
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await deletePushSubscription(sub.endpoint);
        }
      }
    }),
  );
  return { delivered, failed };
}

// ---- Domain-specific helpers ----
export async function pushApprovalCreated(args: { userId?: string; projectId: string; itemTitle: string; amount?: number }): Promise<void> {
  const payload: SentinelPush = {
    title: "Approval needed",
    body: args.amount ? `${args.itemTitle} — $${args.amount.toLocaleString()}` : args.itemTitle,
    icon: "/icons/icon-192.png",
    tag: "approval-" + args.projectId,
    url: `/projects/${args.projectId}/approvals`,
    data: { kind: "approval", projectId: args.projectId },
  };
  if (args.userId) await notifyUser(args.userId, payload);
  else await notifyAll(payload);
}

export async function pushRfiCreated(args: { userId?: string; projectId: string; question: string }): Promise<void> {
  const payload: SentinelPush = {
    title: "New RFI",
    body: args.question.slice(0, 120),
    icon: "/icons/icon-192.png",
    tag: "rfi-" + args.projectId,
    url: `/projects/${args.projectId}/rfis`,
    data: { kind: "rfi", projectId: args.projectId },
  };
  if (args.userId) await notifyUser(args.userId, payload);
  else await notifyAll(payload);
}

export async function pushTaskChange(args: { userId?: string; projectId: string; taskTitle: string; status: string }): Promise<void> {
  const payload: SentinelPush = {
    title: "Task " + args.status,
    body: args.taskTitle,
    icon: "/icons/icon-192.png",
    tag: "task-" + args.projectId,
    url: `/projects/${args.projectId}/tasks`,
    data: { kind: "task", projectId: args.projectId, status: args.status },
  };
  if (args.userId) await notifyUser(args.userId, payload);
  else await notifyAll(payload);
}
