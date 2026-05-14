import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { pushSupported, currentPermission, getExistingSubscription, subscribePush, unsubscribePush, sendTestPush } from "@/lib/push";
import { pending, flush } from "@/lib/offline-queue";
import { useProjectContext } from "@/nav/project-context";

interface MeResponse {
  id: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  email?: string;
  role?: string;
  tenantId?: string;
}
interface ProjectRow {
  id: string;
  name?: string;
  projectName?: string;
  number?: string;
  projectNumber?: string;
}

const BUILD_HASH = (import.meta.env.VITE_BUILD_HASH as string) || "dev";
const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string) || "1.0.0";

export default function ProfilePage() {
  const [subscribed, setSubscribed] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission>("default");
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [queued, setQueued] = useState(0);

  const { selectedProjectId, selectProject, clearProject } = useProjectContext();

  const meQ = useQuery<MeResponse>({ queryKey: ["/api/me"] });
  const projectsQ = useQuery<ProjectRow[]>({ queryKey: ["/api/projects"] });

  useEffect(() => {
    setSupported(pushSupported());
    void currentPermission().then(setPerm);
    void getExistingSubscription().then((s) => setSubscribed(!!s));
    void pending().then(setQueued);
  }, []);

  const onEnable = async () => {
    setBusy(true); setMsg(null);
    const r = await subscribePush();
    setBusy(false);
    if (r.ok) {
      setSubscribed(true);
      setMsg("Push enabled. Sending a test now…");
      const t = await sendTestPush();
      if (t) setMsg(`Test sent to ${t.sent} device${t.sent === 1 ? "" : "s"}.`);
    } else {
      setMsg(r.reason || "Could not enable push.");
    }
    setPerm(await currentPermission());
  };

  const onDisable = async () => {
    setBusy(true); setMsg(null);
    await unsubscribePush();
    setSubscribed(false);
    setBusy(false);
    setMsg("Push disabled on this device.");
  };

  const onTest = async () => {
    setBusy(true); setMsg(null);
    const t = await sendTestPush();
    setBusy(false);
    setMsg(t ? `Test sent to ${t.sent} device${t.sent === 1 ? "" : "s"}.` : "Test failed.");
  };

  const onFlush = async () => {
    setBusy(true);
    const r = await flush();
    setQueued(await pending());
    setBusy(false);
    setMsg(`Flushed ${r.flushed} · ${r.failed} failed.`);
  };

  const onSignOut = async () => {
    if (!window.confirm("Sign out of Sentinel on this device?")) return;
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => null);
    } finally {
      try {
        localStorage.removeItem("sentinel.selectedProject");
      } catch { /* ignore */ }
      window.location.href = "/";
    }
  };

  const onChangeProject = (id: string) => {
    if (!id) {
      clearProject();
      try { localStorage.removeItem("sentinel.selectedProject"); } catch { /* ignore */ }
    } else {
      const p = (projectsQ.data || []).find((x) => x.id === id);
      const name = p?.name || p?.projectName || p?.number || p?.projectNumber || "Project";
      selectProject(id, name);
    }
    // Hard reload so every query/page fully re-scopes to the new project.
    setMsg("Switching project…");
    setTimeout(() => { window.location.reload(); }, 150);
  };

  const me = meQ.data;
  const projects = projectsQ.data || [];

  return (
    <div
      data-testid="profile-page"
      style={{ background: "#0B0D11", minHeight: "100vh", color: "#E8EAEE", padding: "20px 16px 96px" }}
    >
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>Profile</h1>
      <div style={{ color: "#8B92A1", fontSize: 13, marginBottom: 20 }}>
        Account, active project, and mobile preferences.
      </div>

      <Section title="Account">
        {meQ.isLoading ? (
          <Row label="Loading" value="…" />
        ) : me ? (
          <>
            <Row label="Name" value={me.displayName || `${me.firstName ?? ""} ${me.lastName ?? ""}`.trim() || "—"} testid="profile-name" />
            <Row label="Email" value={me.email || "—"} testid="profile-email" />
            <Row label="Role" value={me.role || "—"} testid="profile-role" />
            <Row label="Tenant" value={me.tenantId || "—"} testid="profile-tenant" />
            <button
              data-testid="profile-sign-out"
              onClick={onSignOut}
              disabled={busy}
              style={{ ...btn("transparent", "#E24B4A", "#2C2C2A"), marginTop: 12 }}
            >Sign out</button>
          </>
        ) : (
          <Row label="Account" value="Not signed in" />
        )}
      </Section>

      <Section title="Active project">
        <select
          data-testid="profile-project-switcher"
          value={selectedProjectId || ""}
          onChange={(e) => onChangeProject(e.target.value)}
          style={{
            width: "100%", padding: "10px 12px", background: "#0B0D11",
            color: "#E8EAEE", border: "1px solid #2C2C2A", borderRadius: 10, fontSize: 14,
          }}
        >
          <option value="">Portfolio (no active project)</option>
          {projects.map((p) => {
            const name = p.name || p.projectName || p.number || p.projectNumber || p.id;
            return <option key={p.id} value={p.id}>{name}</option>;
          })}
        </select>
        <div style={{ fontSize: 12, color: "#8B92A1", marginTop: 8 }}>
          Pick a project to scope mobile actions (daily logs, drawings, photos) to it.
        </div>
      </Section>

      <Section title="Notifications">
        {!supported && (
          <Row label="Push" value="Not supported on this browser." />
        )}
        {supported && (
          <>
            <Row label="Permission" value={perm} testid="profile-perm" />
            <Row label="Status" value={subscribed ? "Subscribed" : "Not subscribed"} testid="profile-sub-status" />
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              {subscribed ? (
                <button
                  data-testid="profile-disable-push"
                  onClick={onDisable}
                  disabled={busy}
                  style={btn("transparent", "#E24B4A", "#2C2C2A")}
                >Disable push</button>
              ) : (
                <button
                  data-testid="profile-enable-push"
                  onClick={onEnable}
                  disabled={busy}
                  style={btn("#1D9E75", "#fff")}
                >Enable push</button>
              )}
              {subscribed && (
                <button
                  data-testid="profile-test-push"
                  onClick={onTest}
                  disabled={busy}
                  style={btn("transparent", "#E8EAEE", "#2C2C2A")}
                >Send test</button>
              )}
            </div>
          </>
        )}
      </Section>

      <Section title="Offline queue">
        <Row label="Pending" value={String(queued)} testid="profile-queued" />
        <button
          data-testid="profile-flush-queue"
          onClick={onFlush}
          disabled={busy || queued === 0}
          style={{ ...btn(queued === 0 ? "#2C2C2A" : "#1D9E75", "#fff"), marginTop: 12 }}
        >Sync now</button>
      </Section>

      <Section title="More">
        <Link href="/settings">
          <a
            data-testid="profile-link-settings"
            style={{
              display: "block", padding: "10px 0", color: "#E8EAEE", fontSize: 14,
              borderBottom: "0.5px solid #2C2C2A", textDecoration: "none",
            }}
          >Settings →</a>
        </Link>
      </Section>

      {msg && (
        <div
          data-testid="profile-message"
          style={{
            marginTop: 20, padding: 12, background: "#14171C",
            borderLeft: "3px solid #1D9E75", borderRadius: 10, fontSize: 13, color: "#E8EAEE",
          }}
        >{msg}</div>
      )}

      <footer
        data-testid="profile-build"
        style={{ marginTop: 28, fontSize: 11, color: "#5C6370", textAlign: "center" }}
      >
        Sentinel v{APP_VERSION} · build {BUILD_HASH}
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 12, letterSpacing: "0.08em", color: "#8B92A1", textTransform: "uppercase", marginBottom: 10 }}>
        {title}
      </h2>
      <div style={{ background: "#14171C", borderRadius: 14, padding: 14 }}>
        {children}
      </div>
    </section>
  );
}

function Row({ label, value, testid }: { label: string; value: string; testid?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0" }}>
      <div style={{ fontSize: 13, color: "#8B92A1" }}>{label}</div>
      <div data-testid={testid} style={{ fontSize: 13, color: "#E8EAEE", maxWidth: "60%", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {value}
      </div>
    </div>
  );
}

function btn(bg: string, fg: string, border?: string): React.CSSProperties {
  return {
    padding: "10px 16px",
    background: bg,
    color: fg,
    border: border ? `1px solid ${border}` : "none",
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  };
}
