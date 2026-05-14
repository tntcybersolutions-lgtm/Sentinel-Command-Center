import { useEffect, useState } from "react";

export function OfflineBanner() {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (online) return null;

  return (
    <div
      data-testid="offline-banner"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 60,
        background: "#F0997B",
        color: "#1A0E08",
        padding: "8px 16px",
        fontSize: 13,
        fontWeight: 600,
        textAlign: "center",
        letterSpacing: "0.02em",
      }}
    >
      Offline — changes will sync when you reconnect.
    </div>
  );
}

export default OfflineBanner;
