"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { NAV_GROUPS, isActive, pageTitleFor } from "@/lib/navigation";
import { hasRole, type Role } from "@/lib/enums";
import { formatCoins, formatRelative } from "@/lib/format";
import { Icon } from "@/components/ui/Icons";
import { CoinMark } from "@/components/ui/primitives";
import Avatar from "@/components/ui/Avatar";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import Wordmark from "./Wordmark";

type ServerSnapshot = {
  online: boolean;
  playersOnline: number | null;
  error: string | null;
};

type NotificationItem = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

export default function TopBar({ role }: { role: string }) {
  const pathname = usePathname();
  const title = pageTitleFor(pathname);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-[var(--topbar-h)] items-center gap-3 border-b border-[var(--line-soft)] bg-[color-mix(in_oklab,var(--color-obsidian-950)_78%,transparent)] px-4 backdrop-blur-xl sm:px-6">
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="-ml-1 flex size-10 items-center justify-center rounded-lg text-[var(--text-dim)] transition-colors hover:bg-[color-mix(in_oklab,var(--color-frost-100)_6%,transparent)] lg:hidden"
          aria-label="Avaa valikko"
        >
          <Icon name="menu" size={20} />
        </button>

        <div className="lg:hidden">
          <Wordmark compact size="sm" />
        </div>

        <h1 className="hidden truncate text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-dim)] lg:block">
          {title}
        </h1>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <ServerStatusPill />
          <WalletChip />
          <NotificationBell />
          <SoundToggle />
          <UserMenu role={role} />
        </div>
      </header>

      {menuOpen && <MobileDrawer role={role} onClose={() => setMenuOpen(false)} pathname={pathname} />}
    </>
  );
}

/* -------------------------------------------------------------------------- */

function ServerStatusPill() {
  const [status, setStatus] = useState<ServerSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/server-status", { cache: "no-store" });
        if (!response.ok) throw new Error();
        const data = (await response.json()) as ServerSnapshot;
        if (!cancelled) setStatus(data);
      } catch {
        if (!cancelled) setStatus({ online: false, playersOnline: null, error: "Ei yhteyttä" });
      }
    };
    void load();
    const timer = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const label = !status
    ? "Tarkistetaan"
    : status.online
      ? status.playersOnline !== null
        ? `${status.playersOnline} online`
        : "Online"
      : "Offline";

  const tone = !status
    ? "var(--text-faint)"
    : status.online
      ? "var(--color-emerald-400)"
      : "var(--color-danger-400)";

  return (
    <Link
      href="/home#server"
      className="hidden items-center gap-2 rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text-dim)] sm:flex"
      title={status?.error ?? "Pekoni-palvelimen tila"}
    >
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex size-full rounded-full" style={{ background: tone }} />
        {status?.online && (
          <span
            className="absolute inline-flex size-full animate-ping rounded-full opacity-60"
            style={{ background: tone }}
          />
        )}
      </span>
      <span className="tabular">{label}</span>
    </Link>
  );
}

/* -------------------------------------------------------------------------- */

function WalletChip() {
  const { balance } = usePlayer();
  const [pulse, setPulse] = useState<"up" | "down" | null>(null);
  const previous = useRef(balance);

  useEffect(() => {
    if (balance === previous.current) return;
    setPulse(balance > previous.current ? "up" : "down");
    previous.current = balance;
    const timer = setTimeout(() => setPulse(null), 620);
    return () => clearTimeout(timer);
  }, [balance]);

  return (
    <Link
      href="/profile#wallet"
      className="flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--color-obsidian-880)] py-1.5 pl-2.5 pr-3 transition-colors hover:border-[var(--line-strong)]"
      aria-label={`Saldo ${formatCoins(balance)} Pekoni Coins`}
    >
      <CoinMark size={15} />
      <span
        className="tabular text-sm font-semibold transition-colors duration-500"
        style={{
          color:
            pulse === "up"
              ? "var(--color-emerald-400)"
              : pulse === "down"
                ? "var(--color-danger-400)"
                : "var(--text)",
        }}
      >
        {formatCoins(balance)}
      </span>
    </Link>
  );
}

/* -------------------------------------------------------------------------- */

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unread = items.filter((item) => !item.readAt).length;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      if (response.ok) {
        const data = (await response.json()) as { notifications: NotificationItem[] };
        setItems(data.notifications);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(load, 90_000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const openPanel = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      await load();
      if (unread > 0) {
        void fetch("/api/notifications", { method: "POST" }).then(() =>
          setItems((current) =>
            current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })),
          ),
        );
      }
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={openPanel}
        className="relative flex size-10 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[color-mix(in_oklab,var(--color-frost-100)_6%,transparent)] hover:text-[var(--text-dim)]"
        aria-label={unread > 0 ? `${unread} lukematonta ilmoitusta` : "Ilmoitukset"}
        aria-expanded={open}
      >
        <Icon name="bell" size={18} />
        {unread > 0 && (
          <span className="absolute right-2 top-2 flex min-w-[15px] items-center justify-center rounded-full bg-[var(--color-emerald-500)] px-1 text-[9px] font-bold leading-[15px] text-[#0b1409]">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="panel-raised rise absolute right-0 top-12 z-50 w-[min(92vw,340px)] overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--line-soft)] px-4 py-3">
            <p className="text-sm font-semibold">Ilmoitukset</p>
            {loading && <span className="text-[11px] text-[var(--text-faint)]">Ladataan…</span>}
          </div>
          <div className="hide-scrollbar max-h-[380px] overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
                Ei ilmoituksia vielä.
              </p>
            ) : (
              items.map((item) => {
                const body = (
                  <>
                    <div className="flex items-start gap-2">
                      <span
                        className="mt-1.5 size-1.5 shrink-0 rounded-full"
                        style={{
                          background: item.readAt ? "var(--color-obsidian-700)" : "var(--color-emerald-400)",
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-[var(--text-dim)]">
                          {item.title}
                        </p>
                        {item.body && (
                          <p className="mt-0.5 text-xs leading-snug text-[var(--text-muted)]">
                            {item.body}
                          </p>
                        )}
                        <p className="mt-1 text-[11px] text-[var(--text-faint)]">
                          {formatRelative(item.createdAt)}
                        </p>
                      </div>
                    </div>
                  </>
                );
                return item.href ? (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="block border-b border-[var(--line-soft)] px-4 py-3 transition-colors last:border-0 hover:bg-[color-mix(in_oklab,var(--color-frost-100)_4%,transparent)]"
                  >
                    {body}
                  </Link>
                ) : (
                  <div key={item.id} className="border-b border-[var(--line-soft)] px-4 py-3 last:border-0">
                    {body}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function SoundToggle() {
  const { soundEnabled, toggleSound } = usePreferences();
  return (
    <button
      type="button"
      onClick={toggleSound}
      className="flex size-10 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[color-mix(in_oklab,var(--color-frost-100)_6%,transparent)] hover:text-[var(--text-dim)]"
      aria-label={soundEnabled ? "Mykistä äänet" : "Ota äänet käyttöön"}
      aria-pressed={soundEnabled}
      title={soundEnabled ? "Äänet päällä" : "Äänet pois"}
    >
      <Icon name={soundEnabled ? "volume" : "volumeOff"} size={18} />
    </button>
  );
}

/* -------------------------------------------------------------------------- */

function UserMenu({ role }: { role: string }) {
  const { player } = usePlayer();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!player) {
    return (
      <Link href="/login" className="btn btn-primary btn-sm">
        Kirjaudu
      </Link>
    );
  }

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition-colors hover:bg-[color-mix(in_oklab,var(--color-frost-100)_6%,transparent)]"
        aria-expanded={open}
        aria-label="Käyttäjävalikko"
      >
        <Avatar username={player.username} minecraftUsername={player.minecraftUsername} size={30} ring />
        <span className="hidden max-w-[110px] truncate text-[13px] font-semibold text-[var(--text-dim)] sm:block">
          {player.username}
        </span>
        <Icon name="chevronDown" size={14} className="hidden text-[var(--text-faint)] sm:block" />
      </button>

      {open && (
        <div className="panel-raised rise absolute right-0 top-12 z-50 w-56 overflow-hidden py-1.5">
          <div className="border-b border-[var(--line-soft)] px-4 pb-3 pt-2">
            <p className="truncate text-sm font-semibold">{player.username}</p>
            <p className="mt-0.5 text-[11px] uppercase tracking-[0.12em] text-[var(--text-faint)]">
              Level {player.level} · {role}
            </p>
          </div>
          {[
            { href: "/profile", label: "Profiili", icon: "profile" },
            { href: "/settings", label: "Asetukset", icon: "settings" },
            ...(hasRole(role, "MODERATOR" as Role)
              ? [{ href: "/admin", label: "Admin", icon: "admin" }]
              : []),
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="flex min-h-[40px] items-center gap-3 px-4 text-[13px] text-[var(--text-muted)] transition-colors hover:bg-[color-mix(in_oklab,var(--color-frost-100)_5%,transparent)] hover:text-[var(--text)]"
            >
              <Icon name={item.icon} size={16} />
              {item.label}
            </Link>
          ))}
          <div className="rule my-1.5" />
          <button
            type="button"
            onClick={logout}
            className="flex min-h-[40px] w-full items-center gap-3 px-4 text-left text-[13px] text-[var(--text-muted)] transition-colors hover:bg-[color-mix(in_oklab,var(--color-danger-500)_10%,transparent)] hover:text-[var(--color-danger-400)]"
          >
            <Icon name="logout" size={16} />
            Kirjaudu ulos
          </button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function MobileDrawer({
  role,
  onClose,
  pathname,
}: {
  role: string;
  onClose: () => void;
  pathname: string;
}) {
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.role || hasRole(role, item.role as Role)),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        onClick={onClose}
        aria-label="Sulje valikko"
        className="absolute inset-0 bg-[rgba(4,7,5,0.7)] backdrop-blur-sm"
      />
      <div className="rise absolute inset-y-0 left-0 flex w-[min(84vw,300px)] flex-col border-r border-[var(--line)] bg-[var(--color-obsidian-900)]">
        <div className="flex h-[var(--topbar-h)] items-center justify-between px-5">
          <Wordmark size="sm" />
          <button
            type="button"
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-lg text-[var(--text-muted)]"
            aria-label="Sulje"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <nav className="hide-scrollbar flex-1 overflow-y-auto px-3 pb-6">
          {groups.map((group) => (
            <div key={group.id} className="mb-5">
              {group.label && <p className="eyebrow px-3 pb-2 text-[10px]">{group.label}</p>}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(pathname, item);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onClose}
                        className={`flex min-h-[46px] items-center gap-3 rounded-[10px] px-3 text-sm font-medium transition-colors ${
                          active
                            ? "bg-[color-mix(in_oklab,var(--color-emerald-500)_12%,transparent)] text-[var(--text)]"
                            : "text-[var(--text-muted)]"
                        }`}
                      >
                        <Icon
                          name={item.icon}
                          size={18}
                          className={active ? "text-[var(--color-emerald-400)]" : ""}
                        />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </div>
  );
}
