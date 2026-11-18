"use client";

import { useSyncExternalStore } from "react";

export type ThemeMode = "system" | "light" | "dark";

const KEY = "bandival.theme";
const listeners = new Set<() => void>();

function read(): ThemeMode {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(mode: ThemeMode = read()) {
  const dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  // Native Android shell can match its system bars to the theme.
  (window as unknown as { BandivalAndroid?: { setDarkMode?: (dark: boolean) => void } }).BandivalAndroid?.setDarkMode?.(dark);
}

export function setThemeMode(mode: ThemeMode) {
  try {
    window.localStorage.setItem(KEY, mode);
  } catch {
    // ignore
  }
  applyTheme(mode);
  listeners.forEach((listener) => listener());
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystemChange = () => {
    if (read() === "system") applyTheme("system");
    callback();
  };
  media.addEventListener("change", onSystemChange);
  return () => {
    listeners.delete(callback);
    media.removeEventListener("change", onSystemChange);
  };
}

export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribe, read, () => "system");
}

export const THEME_LABEL: Record<ThemeMode, string> = { system: "System", light: "Hell", dark: "Dunkel" };

export function nextTheme(mode: ThemeMode): ThemeMode {
  return mode === "system" ? "light" : mode === "light" ? "dark" : "system";
}
