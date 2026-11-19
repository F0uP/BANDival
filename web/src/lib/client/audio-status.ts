"use client";

import { useEffect, useRef } from "react";
import { t } from "@/lib/i18n";

/** Polls `refresh` every few seconds while a background conversion is running. */
export function useRefreshWhilePending(pending: boolean, refresh: () => void, intervalMs = 3000) {
  const latest = useRef(refresh);
  useEffect(() => {
    latest.current = refresh;
  });
  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => latest.current(), intervalMs);
    return () => window.clearInterval(timer);
  }, [pending, intervalMs]);
}

/** "Original herunterladen (WAV)" */
export function originalLabel(originalUrl: string): string {
  const extension = originalUrl.split("?")[0].match(/\.([a-z0-9]{1,6})$/i)?.[1]?.toUpperCase();
  return extension ? t("Original herunterladen ({format})", { format: extension }) : t("Original herunterladen");
}
