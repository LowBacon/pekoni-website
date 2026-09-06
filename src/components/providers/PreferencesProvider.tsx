"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { play, playPitched, setMuted, setVolume, type SoundName } from "@/lib/sound";

type Preferences = {
  soundEnabled: boolean;
  reducedMotion: boolean;
  volume: number;
};

type PreferencesContextValue = Preferences & {
  toggleSound: () => void;
  setSoundEnabled: (value: boolean) => void;
  setReducedMotion: (value: boolean) => void;
  changeVolume: (value: number) => void;
  sound: (name: SoundName) => void;
  soundPitched: (name: "crashTick" | "caseTick", progress: number) => void;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

const STORAGE_KEY = "pekoni.preferences";

export default function PreferencesProvider({
  children,
  initial,
}: {
  children: ReactNode;
  initial?: Partial<Preferences>;
}) {
  const [soundEnabled, setSoundEnabledState] = useState(initial?.soundEnabled ?? false);
  const [reducedMotionPref, setReducedMotionPref] = useState(initial?.reducedMotion ?? false);
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);
  const [volume, setVolumeState] = useState(initial?.volume ?? 0.5);

  // Local overrides survive a reload for signed-out visitors too.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const stored = JSON.parse(raw) as Partial<Preferences>;
        if (typeof stored.soundEnabled === "boolean") setSoundEnabledState(stored.soundEnabled);
        if (typeof stored.reducedMotion === "boolean") setReducedMotionPref(stored.reducedMotion);
        if (typeof stored.volume === "number") setVolumeState(stored.volume);
      }
    } catch {
      /* storage can be unavailable — defaults are fine */
    }
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setSystemReducedMotion(query.matches);
    const listener = (event: MediaQueryListEvent) => setSystemReducedMotion(event.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  const reducedMotion = reducedMotionPref || systemReducedMotion;

  useEffect(() => {
    setMuted(!soundEnabled);
  }, [soundEnabled]);

  useEffect(() => {
    setVolume(volume);
  }, [volume]);

  useEffect(() => {
    document.documentElement.dataset.reducedMotion = reducedMotion ? "true" : "false";
  }, [reducedMotion]);

  const persist = useCallback((next: Partial<Preferences>) => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const current = raw ? JSON.parse(raw) : {};
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...next }));
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<PreferencesContextValue>(
    () => ({
      soundEnabled,
      reducedMotion,
      volume,
      toggleSound: () => {
        setSoundEnabledState((previous) => {
          const next = !previous;
          setMuted(!next);
          persist({ soundEnabled: next });
          // The toggle itself is the gesture that unlocks the audio context.
          if (next) play("click");
          void fetch("/api/settings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ soundEnabled: next }),
          }).catch(() => undefined);
          return next;
        });
      },
      setSoundEnabled: (next: boolean) => {
        setSoundEnabledState(next);
        persist({ soundEnabled: next });
      },
      setReducedMotion: (next: boolean) => {
        setReducedMotionPref(next);
        persist({ reducedMotion: next });
      },
      changeVolume: (next: number) => {
        setVolumeState(next);
        persist({ volume: next });
      },
      sound: (name: SoundName) => {
        if (soundEnabled) play(name);
      },
      soundPitched: (name: "crashTick" | "caseTick", progress: number) => {
        if (soundEnabled) playPitched(name, progress);
      },
    }),
    [soundEnabled, reducedMotion, volume, persist],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error("usePreferences must be used inside PreferencesProvider");
  }
  return context;
}

/** Safe outside the provider (used by purely decorative components). */
export function useReducedMotion(): boolean {
  const context = useContext(PreferencesContext);
  const [system, setSystem] = useState(false);

  useEffect(() => {
    if (context) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setSystem(query.matches);
    const listener = (event: MediaQueryListEvent) => setSystem(event.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, [context]);

  return context ? context.reducedMotion : system;
}

/** Convenience hook for the many components that only need to fire a cue. */
export function useSound() {
  const context = useContext(PreferencesContext);
  return useCallback(
    (name: SoundName) => {
      if (context?.soundEnabled) play(name);
    },
    [context],
  );
}
