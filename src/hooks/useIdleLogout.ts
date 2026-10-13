import { useEffect, useRef } from "react";

const KEY = "rush:last-activity";

/** Calls onIdle after `minutes` without user activity (shared across tabs). */
export function useIdleLogout(minutes: number, onIdle: () => void) {
  const cb = useRef(onIdle);
  cb.current = onIdle;

  useEffect(() => {
    const limit = minutes * 60_000;
    let lastWrite = 0;
    const touch = () => {
      const now = Date.now();
      if (now - lastWrite > 5000) {
        lastWrite = now;
        localStorage.setItem(KEY, String(now));
      }
    };
    localStorage.setItem(KEY, String(Date.now()));
    const events = ["mousedown", "keydown", "touchstart", "scroll", "mousemove"];
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const timer = setInterval(() => {
      const last = Number(localStorage.getItem(KEY) || Date.now());
      if (Date.now() - last > limit) cb.current();
    }, 30_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch));
      clearInterval(timer);
    };
  }, [minutes]);
}
