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
import { usePreferences } from "./PreferencesProvider";

export type ToastKind = "success" | "error" | "warning" | "info" | "reward";

export type Toast = {
  id: string;
  kind: ToastKind;
  title: string;
  body?: string;
  /** Milliseconds; 0 keeps it until dismissed. */
  duration?: number;
};

type ToastContextValue = {
  toast: (input: Omit<Toast, "id">) => void;
  success: (title: string, body?: string) => void;
  error: (title: string, body?: string) => void;
  warning: (title: string, body?: string) => void;
  reward: (title: string, body?: string) => void;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const KIND_STYLES: Record<ToastKind, { accent: string; icon: ReactNode }> = {
  success: {
    accent: "var(--color-emerald-400)",
    icon: (
      <path d="M4 8.5l3 3 5.5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    ),
  },
  error: {
    accent: "var(--color-danger-500)",
    icon: (
      <path d="M5 5l6 6M11 5l-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    ),
  },
  warning: {
    accent: "var(--color-amber-500)",
    icon: (
      <path d="M8 4v5M8 11.6v.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    ),
  },
  info: {
    accent: "var(--color-cyan-500)",
    icon: (
      <path d="M8 7.2v4.6M8 4.4v.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    ),
  },
  reward: {
    accent: "var(--color-amber-400)",
    icon: (
      <path d="M8 3l1.6 3.3 3.6.5-2.6 2.5.6 3.6L8 11.2 4.8 12.9l.6-3.6L2.8 6.8l3.6-.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill="none" />
    ),
  },
};

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (input: Omit<Toast, "id">) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const duration = input.duration ?? (input.kind === "error" ? 6_000 : 4_200);
      setToasts((current) => [...current.slice(-3), { ...input, id }]);
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach(clearTimeout);
      map.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      dismiss,
      success: (title, body) => toast({ kind: "success", title, body }),
      error: (title, body) => toast({ kind: "error", title, body }),
      warning: (title, body) => toast({ kind: "warning", title, body }),
      reward: (title, body) => toast({ kind: "reward", title, body }),
    }),
    [toast, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[120] flex flex-col items-center gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end sm:px-0"
      role="region"
      aria-label="Ilmoitukset"
    >
      {toasts.map((item) => {
        const style = KIND_STYLES[item.kind];
        return (
          <div
            key={item.id}
            role="status"
            aria-live="polite"
            className="panel-raised rise pointer-events-auto flex w-full max-w-sm items-start gap-3 px-4 py-3"
            style={{ borderColor: `color-mix(in oklab, ${style.accent} 28%, transparent)` }}
          >
            <span
              className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full"
              style={{
                background: `color-mix(in oklab, ${style.accent} 18%, transparent)`,
                color: style.accent,
              }}
            >
              <svg viewBox="0 0 16 16" className="size-4">
                {style.icon}
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--text)]">{item.title}</p>
              {item.body && (
                <p className="mt-0.5 text-[13px] leading-snug text-[var(--text-muted)]">{item.body}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(item.id)}
              aria-label="Sulje ilmoitus"
              className="-m-1 shrink-0 rounded-md p-1 text-[var(--text-faint)] transition-colors hover:text-[var(--text)]"
            >
              <svg viewBox="0 0 16 16" className="size-3.5">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}

/** Plays the matching cue alongside the toast. */
export function useGameFeedback() {
  const toast = useToast();
  const { sound } = usePreferences();

  return useMemo(
    () => ({
      win: (amount: string) => {
        sound("win");
        toast.success(`+${amount} coins`);
      },
      bigWin: (amount: string) => {
        sound("bigWin");
        toast.reward(`+${amount} coins`, "Iso voitto!");
      },
      lose: () => sound("lose"),
      error: (message: string) => {
        sound("error");
        toast.error(message);
      },
    }),
    [toast, sound],
  );
}
