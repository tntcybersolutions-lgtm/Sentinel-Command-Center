function safeVibrate(pattern: number | number[]): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
    }
  } catch {}
}
export function tap(): void { safeVibrate(10); }
export function select(): void { safeVibrate(6); }
export function success(): void { safeVibrate([8, 40, 8]); }
export function warning(): void { safeVibrate([12, 60, 12, 60, 12]); }
export function error(): void { safeVibrate([20, 60, 20, 60, 20]); }
export function heavy(): void { safeVibrate(35); }
export function stop(): void { safeVibrate(0); }
