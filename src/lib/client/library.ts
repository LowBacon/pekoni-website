"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Favourites and recently-played, stored per browser.
 *
 * Deliberately not server state. Neither is authoritative, neither affects a
 * balance, and neither is worth a write on every game open — but both are worth
 * surviving a refresh. `localStorage` throws outright in some contexts (private
 * windows, blocked site data, thumbnail capture), so every access is guarded and
 * the hooks degrade to in-memory rather than taking the page down with them.
 */

const FAVOURITES_KEY = "minebet.favourites";
const RECENT_KEY = "minebet.recent";
const RECENT_LIMIT = 6;

function read(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    // Anything could be in there — another tab, an older build, a person with
    // devtools open. Only keep what still looks like a list of game keys.
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function write(key: string, value: string[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage unavailable; the in-memory state still works for this session. */
  }
}

export function useFavourites() {
  const [favourites, setFavourites] = useState<string[]>([]);

  // Read after mount, never during render: the server has no localStorage, and
  // seeding state from it directly would mismatch on hydration.
  useEffect(() => setFavourites(read(FAVOURITES_KEY)), []);

  const toggle = useCallback((key: string) => {
    setFavourites((current) => {
      const next = current.includes(key)
        ? current.filter((entry) => entry !== key)
        : [...current, key];
      write(FAVOURITES_KEY, next);
      return next;
    });
  }, []);

  return { favourites, toggle, isFavourite: (key: string) => favourites.includes(key) };
}

export function useRecentGames() {
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => setRecent(read(RECENT_KEY)), []);

  const remember = useCallback((key: string) => {
    setRecent((current) => {
      const next = [key, ...current.filter((entry) => entry !== key)].slice(0, RECENT_LIMIT);
      write(RECENT_KEY, next);
      return next;
    });
  }, []);

  return { recent, remember };
}
