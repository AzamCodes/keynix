import { afterEach, describe, expect, it, vi } from "vitest";
import { installIdleLock } from "../src/lib/idle-lock";

afterEach(() => vi.useRealTimers());

describe("vault inactivity lock lifecycle", () => {
  it("arms immediately and resets on pointer, keyboard, and touch activity", () => {
    vi.useFakeTimers();
    const onLock = vi.fn();
    const cleanup = installIdleLock(1000, onLock);

    vi.advanceTimersByTime(900);
    window.dispatchEvent(new Event("mousemove"));
    vi.advanceTimersByTime(900);
    window.dispatchEvent(new Event("pointerdown"));
    vi.advanceTimersByTime(900);
    window.dispatchEvent(new Event("keydown"));
    vi.advanceTimersByTime(900);
    window.dispatchEvent(new Event("touchstart"));
    vi.advanceTimersByTime(999);
    expect(onLock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onLock).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("cleans timers and handlers and locks on return after an elapsed timeout", () => {
    vi.useFakeTimers();
    const onLock = vi.fn();
    const cleanup = installIdleLock(1000, onLock);
    vi.advanceTimersByTime(400);
    cleanup();
    vi.advanceTimersByTime(2000);
    window.dispatchEvent(new Event("pointerdown"));
    expect(onLock).not.toHaveBeenCalled();

    const visibility = Object.getOwnPropertyDescriptor(document, "visibilityState");
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    const onReturnLock = vi.fn();
    const cleanupSecond = installIdleLock(1000, onReturnLock);
    vi.advanceTimersByTime(1001);
    expect(onReturnLock).toHaveBeenCalledTimes(1);
    // Timer expiry models the browser's normal timer path; visibility changes
    // are separately dispatched to make sure the listener is registered.
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(onReturnLock).toHaveBeenCalledTimes(2);
    cleanupSecond();
    if (visibility) Object.defineProperty(document, "visibilityState", visibility);
    else Reflect.deleteProperty(document, "visibilityState");
  });
});
