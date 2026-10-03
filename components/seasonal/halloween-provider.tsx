"use client";

import { createContext, useContext, useEffect, useSyncExternalStore } from "react";

const preferenceEvent = "axis-halloween-preference";
const fallbackPreferences = new Map<string, string>();

function readPreference(key: string) {
  try { return localStorage.getItem(key) ?? fallbackPreferences.get(key); }
  catch { return fallbackPreferences.get(key); }
}

function writePreference(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
    fallbackPreferences.delete(key);
  } catch { fallbackPreferences.set(key, value); }
  window.dispatchEvent(new Event(preferenceEvent));
}

function getSnapshot() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "America/Bogota", month: "2-digit", year: "numeric",
  }).formatToParts(new Date());
  if (parts.find((part) => part.type === "month")?.value !== "10") return null;
  const key = `axis-halloween-${parts.find((part) => part.type === "year")?.value}`;
  const theme = readPreference(key) === "off" ? "off" : "on";
  const motion = readPreference(`${key}-motion`) === "paused" ? "paused" : "running";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return `${key}:${theme}:${motion}:${reduced ? "reduced" : "normal"}`;
}

function subscribe(listener: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  window.addEventListener("storage", listener);
  window.addEventListener(preferenceEvent, listener);
  document.addEventListener("visibilitychange", listener);
  media.addEventListener("change", listener);
  // Retire the seasonal decoration even if Axis stays open past October.
  const timer = window.setInterval(listener, 60_000);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(preferenceEvent, listener);
    document.removeEventListener("visibilitychange", listener);
    media.removeEventListener("change", listener);
    window.clearInterval(timer);
  };
}

const getServerSnapshot = () => null;
const HalloweenContext = createContext({
  season: false, enabled: false, paused: false, reducedMotion: false,
  toggleTheme: () => {}, toggleMotion: () => {},
});

export function HalloweenProvider({ children }: { children: React.ReactNode }) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [key, theme, motion, preference] = snapshot?.split(":") ?? [];
  const enabled = theme === "on";
  const reducedMotion = preference === "reduced";
  const paused = motion === "paused" || reducedMotion;

  useEffect(() => {
    document.documentElement.toggleAttribute("data-halloween", enabled);
    document.documentElement.toggleAttribute("data-halloween-paused", paused);
    return () => {
      document.documentElement.removeAttribute("data-halloween");
      document.documentElement.removeAttribute("data-halloween-paused");
    };
  }, [enabled, paused]);

  return (
    <HalloweenContext.Provider value={{
      season: Boolean(key), enabled, paused, reducedMotion,
      toggleTheme: () => { if (key) writePreference(key, enabled ? "off" : "on"); },
      toggleMotion: () => { if (key) writePreference(`${key}-motion`, paused ? "running" : "paused"); },
    }}>
      {children}
    </HalloweenContext.Provider>
  );
}

export const useHalloween = () => useContext(HalloweenContext);
