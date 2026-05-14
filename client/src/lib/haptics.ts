// client/src/lib/haptics.ts
// Sprint 6: native-feel haptic feedback via navigator.vibrate.
// All calls are no-ops if vibrate isn't supported (most desktops, some browsers).

function safeVibrate(pattern: number | number[]): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
    }
  } catch {
    // Permission denied or platform unsupported — ignore.
  }
}

/** Light tap — primary button press, nav switch. */
export function tap(): void { safeVibrate(10); }

/** Selection — picker change, swipe reveal. */
export function select(): void { safeVibrate(6); }

/** Success — save confirmed, sync drained. */
export function success(): void { safeVibrate([8, 40, 8]); }

/** Warning — queue stuck, retry needed. */
export function warning(): void { safeVibrate([12, 60, 12, 60, 12]); }

/** Error — submit failed, validation rejected. */
export function error(): void { safeVibrate([20, 60, 20, 60, 20]); }

/** Heavy — destructive confirm, undo expired. */
export function heavy(): void { safeVibrate(35); }

/** Cancel any in-flight pattern. */
export function stop(): void { safeVibrate(0); }
