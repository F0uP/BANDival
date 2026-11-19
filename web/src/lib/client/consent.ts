"use client";

import { useSyncExternalStore } from "react";

/**
 * Cookie notice state. Bandival itself only uses technically necessary cookies – the only thing that
 * needs consent are external players (Spotify, YouTube), which are loaded on demand.
 *
 * Cookie `bandival_consent`: "necessary" | "media" (one year).
 */
export const CONSENT_COOKIE = "bandival_consent";
export type ConsentChoice = "necessary" | "media";

const CHANGE_EVENT = "bandival:consent";
const OPEN_EVENT = "bandival:consent-open";
const LEGACY_SPOTIFY_KEY = "bandival.consent.spotify";

export function readConsent(): ConsentChoice | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)bandival_consent=(necessary|media)(?:;|$)/);
  if (match) return match[1] as ConsentChoice;
  try {
    // Earlier versions remembered the Spotify choice in localStorage only.
    if (localStorage.getItem(LEGACY_SPOTIFY_KEY) === "1") return "media";
  } catch {
    /* storage blocked */
  }
  return null;
}

export function setConsent(choice: ConsentChoice) {
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${choice}; path=/; max-age=31536000; samesite=lax${secure}`;
  try {
    if (choice === "necessary") localStorage.removeItem(LEGACY_SPOTIFY_KEY);
  } catch {
    /* storage blocked */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Shows the cookie notice again (link "Cookie-Einstellungen"). */
export function openConsentSettings() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

function subscribe(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function useConsent(serverValue: ConsentChoice | null = null): ConsentChoice | null {
  return useSyncExternalStore(subscribe, readConsent, () => serverValue);
}

export function onConsentSettingsRequested(callback: () => void) {
  window.addEventListener(OPEN_EVENT, callback);
  return () => window.removeEventListener(OPEN_EVENT, callback);
}
