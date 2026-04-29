"use client";

import { useEffect } from "react";

/**
 * Регистрируем отдельный SW только в /staff, чтобы не трогать другие разделы.
 */
export function StaffPwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (!window.isSecureContext) return;

    void navigator.serviceWorker.register("/staff/sw.js", { scope: "/staff/" });
  }, []);

  return null;
}
