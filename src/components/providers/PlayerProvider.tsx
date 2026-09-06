"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { levelFromXp } from "@/lib/progression";
import { IS_STATIC } from "@/lib/static/config";
import { usePreferences } from "./PreferencesProvider";
import { useToast } from "./ToastProvider";

export type PlayerSnapshot = {
  id: string;
  username: string;
  role: string;
  minecraftUsername: string | null;
  avatarUrl: string | null;
  balance: number;
  level: number;
  xp: number;
} | null;

type PlayerContextValue = {
  player: PlayerSnapshot;
  balance: number;
  /** Applies an authoritative balance returned by a server response. */
  syncBalance: (balance: number) => void;
  /** Applies level/XP and celebrates a level-up exactly once. */
  syncProgress: (input: { level: number; leveledUp?: boolean; xp?: number }) => void;
  celebrate: (unlocked: { title: string; description: string; coinReward: number }[]) => void;
  refresh: () => Promise<void>;
  levelProgress: { level: number; xpIntoLevel: number; xpForNext: number; progress: number };
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

export default function PlayerProvider({
  children,
  initial,
}: {
  children: ReactNode;
  initial: PlayerSnapshot;
}) {
  const [player, setPlayer] = useState<PlayerSnapshot>(initial);
  const { sound } = usePreferences();
  const toast = useToast();
  const lastLevel = useRef(initial?.level ?? 1);

  // Keep the header in step when a server component re-renders with new data.
  useEffect(() => {
    setPlayer(initial);
    lastLevel.current = initial?.level ?? 1;
  }, [initial]);

  const syncBalance = useCallback((balance: number) => {
    setPlayer((current) => (current ? { ...current, balance } : current));
  }, []);

  const syncProgress = useCallback(
    ({ level, leveledUp, xp }: { level: number; leveledUp?: boolean; xp?: number }) => {
      setPlayer((current) =>
        current ? { ...current, level, xp: xp ?? current.xp } : current,
      );
      if (leveledUp && level > lastLevel.current) {
        lastLevel.current = level;
        sound("levelUp");
        toast.reward(`Level ${level}`, "Uusi taso saavutettu.");
      }
    },
    [sound, toast],
  );

  const celebrate = useCallback(
    (unlocked: { title: string; description: string; coinReward: number }[]) => {
      for (const achievement of unlocked) {
        sound("rare");
        toast.reward(
          achievement.title,
          achievement.coinReward > 0
            ? `${achievement.description} · +${achievement.coinReward} coins`
            : achievement.description,
        );
      }
    },
    [sound, toast],
  );

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/me", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { user: PlayerSnapshot };
      setPlayer(data.user);
    } catch {
      /* offline — the cached snapshot stays on screen */
    }
  }, []);

  // The static build has no server render to seed from, so the header fills
  // itself in from the local backend on first paint.
  useEffect(() => {
    if (IS_STATIC && !initial) void refresh();
  }, [initial, refresh]);

  const levelProgress = useMemo(
    () => levelFromXp(player?.xp ?? 0),
    [player?.xp],
  );

  const value = useMemo<PlayerContextValue>(
    () => ({
      player,
      balance: player?.balance ?? 0,
      syncBalance,
      syncProgress,
      celebrate,
      refresh,
      levelProgress,
    }),
    [player, syncBalance, syncProgress, celebrate, refresh, levelProgress],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextValue {
  const context = useContext(PlayerContext);
  if (!context) throw new Error("usePlayer must be used inside PlayerProvider");
  return context;
}

/**
 * One place that knows how to fold a game response back into the UI: balance,
 * progression and achievement celebrations all land together.
 */
export function useSettleResponse() {
  const { syncBalance, syncProgress, celebrate } = usePlayer();

  return useCallback(
    (data: {
      balance?: number;
      level?: number;
      leveledUp?: boolean;
      unlocked?: { title: string; description: string; coinReward: number }[];
    }) => {
      if (typeof data.balance === "number") syncBalance(data.balance);
      if (typeof data.level === "number") {
        syncProgress({ level: data.level, leveledUp: data.leveledUp });
      }
      if (data.unlocked?.length) celebrate(data.unlocked);
    },
    [syncBalance, syncProgress, celebrate],
  );
}
