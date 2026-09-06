"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { withBasePath } from "@/lib/static/config";

/**
 * One client-side entry point to the Pekoni API.
 *
 * Under the server deployment these calls hit the route handlers in
 * `src/app/api`. In the static export the same paths are answered in-browser by
 * the demo backend. Neither the pages nor the components know the difference.
 */

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function apiUrl(path: string): string {
  return withBasePath(path);
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      cache: "no-store",
      credentials: "same-origin",
      ...init,
      headers:
        init?.body !== undefined
          ? { "Content-Type": "application/json", ...(init?.headers ?? {}) }
          : init?.headers,
    });
  } catch {
    throw new ApiError("Palvelimeen ei saatu yhteyttä.", 0, "NETWORK");
  }

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : {};

  if (!response.ok) {
    const body = payload as { error?: string; code?: string };
    throw new ApiError(body.error ?? "Jokin meni pieleen.", response.status, body.code);
  }

  return payload as T;
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) });
}

/** A key that makes a retried write idempotent server-side. */
export function idempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

type ResourceState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
  setData: (updater: T | ((current: T | null) => T | null)) => void;
};

/**
 * Read-only data with the three states every Pekoni surface has to show:
 * skeleton, error-with-retry, and content. Optionally re-polls on an interval,
 * which is how the lobby and the live rails stay current.
 *
 * Polling stops while the tab is hidden. A backgrounded lobby was otherwise
 * still hitting the API every few seconds for a screen nobody was looking at —
 * on a phone that is radio time and battery for nothing. Coming back to the tab
 * refetches immediately, so the first thing the player sees is current.
 */
export function useResource<T>(
  path: string | null,
  { pollMs, enabled = true }: { pollMs?: number; enabled?: boolean } = {},
): ResourceState<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path) && enabled);
  const [nonce, setNonce] = useState(0);
  const hasData = useRef(false);

  useEffect(() => {
    if (!path || !enabled) return;
    let cancelled = false;

    const load = async () => {
      try {
        const result = await apiFetch<T>(path);
        if (cancelled) return;
        hasData.current = true;
        setDataState(result);
        setError(null);
      } catch (cause) {
        if (cancelled) return;
        // A poll that fails leaves the last good payload on screen rather than
        // blanking a page the player is reading.
        if (!hasData.current) setError(cause instanceof Error ? cause.message : "Jokin meni pieleen.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    if (!pollMs) {
      return () => {
        cancelled = true;
      };
    }

    let timer: ReturnType<typeof setInterval> | null = null;

    const hidden = () =>
      typeof document !== "undefined" && document.visibilityState === "hidden";

    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };

    const start = () => {
      if (timer !== null || hidden()) return;
      timer = setInterval(load, pollMs);
    };

    const onVisibility = () => {
      if (hidden()) {
        stop();
      } else {
        // Catch up on whatever was missed before resuming the cadence.
        void load();
        start();
      }
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [path, pollMs, nonce, enabled]);

  const reload = useCallback(() => {
    setError(null);
    setLoading(!hasData.current);
    setNonce((value) => value + 1);
  }, []);

  const setData = useCallback((updater: T | ((current: T | null) => T | null)) => {
    setDataState((current) =>
      typeof updater === "function" ? (updater as (c: T | null) => T | null)(current) : updater,
    );
  }, []);

  return { data, error, loading, reload, setData };
}
