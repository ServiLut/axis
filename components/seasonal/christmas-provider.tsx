"use client";

import { createContext, useContext, useEffect, useSyncExternalStore } from "react";
import { getChristmasSeasonYear, getNextChristmasBoundary } from "@/lib/christmas-calendar";

const preferenceEvent = "axis-christmas-preference";
const fallbackPreferences = new Map<string, string>();

function readPreference(key: string) {
  try { return localStorage.getItem(key) ?? fallbackPreferences.get(key); }
  catch { return fallbackPreferences.get(key); }
}

function writePreference(key: string, value: string) {
  try { localStorage.setItem(key, value); fallbackPreferences.delete(key); }
  catch { fallbackPreferences.set(key, value); }
  window.dispatchEvent(new Event(preferenceEvent));
}

function getSnapshot() {
  const year = getChristmasSeasonYear();
  // Preferences cannot enable Christmas outside December 1 through January 10.
  if (year === null) return null;
  const key = `axis-christmas-${year}`;
  const theme = readPreference(key) === "off" ? "off" : "on";
  const motion = readPreference(`${key}-motion`) === "paused" ? "paused" : "running";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return `${key}:${theme}:${motion}:${reduced ? "reduced" : "normal"}`;
}

function subscribe(listener: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  let boundaryTimer: number | undefined;
  const refresh = () => {
    window.clearTimeout(boundaryTimer);
    listener();
    const next = getNextChristmasBoundary();
    if (next !== null) {
      boundaryTimer = window.setTimeout(refresh, Math.min(Math.max(next - Date.now(), 1), 2_147_483_647));
    }
  };
  window.addEventListener("storage", refresh);
  window.addEventListener(preferenceEvent, refresh);
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", refresh);
  media.addEventListener("change", refresh);
  const timer = window.setInterval(refresh, 60_000);
  refresh();
  return () => {
    window.removeEventListener("storage", refresh);
    window.removeEventListener(preferenceEvent, refresh);
    window.removeEventListener("focus", refresh);
    document.removeEventListener("visibilitychange", refresh);
    media.removeEventListener("change", refresh);
    window.clearInterval(timer);
    window.clearTimeout(boundaryTimer);
  };
}

const getServerSnapshot = () => null;
const ChristmasContext = createContext({
  season: false, enabled: false, paused: false, reducedMotion: false,
  toggleTheme: () => {}, toggleMotion: () => {},
});

export function ChristmasProvider({ children }: { children: React.ReactNode }) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [key, theme, motion, preference] = snapshot?.split(":") ?? [];
  const enabled = theme === "on";
  const reducedMotion = preference === "reduced";
  const paused = motion === "paused" || reducedMotion;

  useEffect(() => {
    document.documentElement.toggleAttribute("data-christmas", enabled);
    document.documentElement.toggleAttribute("data-christmas-paused", paused);
    return () => {
      document.documentElement.removeAttribute("data-christmas");
      document.documentElement.removeAttribute("data-christmas-paused");
    };
  }, [enabled, paused]);

  return (
    <ChristmasContext.Provider value={{
      season: Boolean(key), enabled, paused, reducedMotion,
      toggleTheme: () => { if (key && getChristmasSeasonYear() !== null) writePreference(key, enabled ? "off" : "on"); },
      toggleMotion: () => { if (key && getChristmasSeasonYear() !== null) writePreference(`${key}-motion`, paused ? "running" : "paused"); },
    }}>
      {children}
    </ChristmasContext.Provider>
  );
}

export const useChristmas = () => useContext(ChristmasContext);
