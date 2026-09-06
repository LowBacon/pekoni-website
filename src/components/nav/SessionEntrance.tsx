"use client";

import { useEffect, useState } from "react";
import { usePreferences } from "@/components/providers/PreferencesProvider";

/**
 * The arrival greeting, shown once per visit.
 *
 * Three decisions worth spelling out:
 *
 * 1. It only ever renders for an authenticated player. The component is mounted
 *    inside the app shell, which the layout has already gated on a live session,
 *    and it additionally refuses to run without a `playerId`. There is no path
 *    where a welcome appears before authentication has actually succeeded.
 *
 * 2. "Welcome back" is decided by `localStorage` — has this browser seen this
 *    player before? — while "once per visit" is decided by `sessionStorage`:
 *    has this tab already greeted them? Two different questions, so two
 *    different stores. Using one for both would either greet on every refresh
 *    or never say "back" at all.
 *
 * 3. The name is used only when it is genuinely a name. `username` is a handle,
 *    and reading someone's login back at them is not personalisation. Only a
 *    provider display name qualifies; without one the greeting is simply
 *    "Welcome", which reads fine and is honest.
 *
 * The overlay never blocks the page: it is `pointer-events: none`, the content
 * underneath stays interactive throughout, and nothing is gated on the animation
 * finishing. If the script fails, the page is simply not decorated.
 */

const VISIT_KEY = "minebet.greeted"; // per tab: once per visit
const SEEN_KEY = "minebet.seen"; // per browser: have we met before?
const DURATION_MS = 1500;

/** Reads defensively — private windows and blocked site data both throw. */
function read(store: "session" | "local", key: string): string | null {
  try {
    return (store === "session" ? window.sessionStorage : window.localStorage).getItem(key);
  } catch {
    return null;
  }
}

function write(store: "session" | "local", key: string, value: string): void {
  try {
    (store === "session" ? window.sessionStorage : window.localStorage).setItem(key, value);
  } catch {
    /* Nothing to remember; the greeting simply shows again next time. */
  }
}

/**
 * The first word of a display name, when it looks like one.
 *
 * Guards against the shapes providers actually return: an e-mail address, a
 * handle with no spaces and odd punctuation, or something long enough to break
 * the layout. Anything failing these tests yields no name rather than a mangled
 * one — "Welcome" beats "Welcome, xX_pekoni420_Xx".
 */
export function firstNameFrom(displayName: string | null): string | null {
  if (!displayName) return null;

  const trimmed = displayName.trim();
  if (!trimmed || trimmed.includes("@")) return null;

  const first = trimmed.split(/\s+/)[0];
  if (first.length < 2 || first.length > 20) return null;
  // Letters, marks, and the punctuation real names actually use. No digits.
  if (!/^[\p{L}\p{M}][\p{L}\p{M}'’-]*$/u.test(first)) return null;

  return first;
}

export default function SessionEntrance({
  playerId,
  displayName = null,
}: {
  playerId: string | null;
  displayName?: string | null;
}) {
  const [greeting, setGreeting] = useState<string | null>(null);
  const { reducedMotion } = usePreferences();

  useEffect(() => {
    if (!playerId) return;

    // Once per tab, keyed by player so switching accounts greets again.
    if (read("session", VISIT_KEY) === playerId) return;
    write("session", VISIT_KEY, playerId);

    const returning = read("local", SEEN_KEY) === playerId;
    write("local", SEEN_KEY, playerId);

    const name = firstNameFrom(displayName);
    const base = returning ? "Welcome back" : "Welcome";
    setGreeting(name ? `${base}, ${name}` : base);
  }, [playerId, displayName]);

  /*
    The dismissal timer belongs to the greeting, not to the decision above.

    Kept separate because `reducedMotion` resolves from storage a moment after
    mount; with the timer in that effect, the re-run would clear it and then hit
    the "already greeted" early return without setting a new one — leaving the
    overlay up for good.
  */
  useEffect(() => {
    if (!greeting) return;
    const timer = setTimeout(() => setGreeting(null), reducedMotion ? 900 : DURATION_MS);
    return () => clearTimeout(timer);
  }, [greeting, reducedMotion]);

  if (!greeting) return null;

  return (
    <div className="mb-greet" role="status" aria-live="polite">
      <p className="mb-greet-text">{greeting}</p>
    </div>
  );
}
