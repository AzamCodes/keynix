export function installIdleLock(timeoutMs: number, onLock: () => void): () => void {
  let lastActivityAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const armTimer = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(onLock, timeoutMs);
  };
  const handleActivity = () => {
    lastActivityAt = Date.now();
    armTimer();
  };
  const handleVisibility = () => {
    if (document.visibilityState !== "visible") return;
    if (Date.now() - lastActivityAt >= timeoutMs) onLock();
    else armTimer();
  };

  // Start immediately so an idle vault cannot remain unlocked because there
  // has not yet been another input event after unlocking.
  armTimer();
  window.addEventListener("mousemove", handleActivity);
  window.addEventListener("pointerdown", handleActivity);
  window.addEventListener("keydown", handleActivity);
  window.addEventListener("touchstart", handleActivity, { passive: true });
  document.addEventListener("visibilitychange", handleVisibility);

  return () => {
    if (timer) clearTimeout(timer);
    window.removeEventListener("mousemove", handleActivity);
    window.removeEventListener("pointerdown", handleActivity);
    window.removeEventListener("keydown", handleActivity);
    window.removeEventListener("touchstart", handleActivity);
    document.removeEventListener("visibilitychange", handleVisibility);
  };
}
