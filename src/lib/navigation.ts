import type { Role } from "./enums";

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  /** Minimum role required. Server routes enforce this independently. */
  role?: Role;
  /** Additional path prefixes that should light this item up. */
  match?: string[];
  badge?: "daily";
};

export type NavGroup = {
  id: string;
  label?: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "main",
    items: [
      { href: "/home", label: "Home", icon: "home" },
      { href: "/games-hub", label: "Games", icon: "games", match: ["/games/"] },
      { href: "/casino", label: "MineBet", icon: "minebet" },
    ],
  },
  {
    id: "cases",
    label: "Cases",
    items: [
      { href: "/caser", label: "Cases", icon: "cases" },
      { href: "/battles", label: "Case Battles", icon: "battles" },
      { href: "/daily-case", label: "Daily Case", icon: "daily", badge: "daily" },
    ],
  },
  {
    id: "player",
    label: "Pelaaja",
    items: [
      { href: "/wallet", label: "Wallet", icon: "wallet" },
      { href: "/leaderboard", label: "Leaderboard", icon: "leaderboard" },
      { href: "/profile", label: "Profile", icon: "profile" },
    ],
  },
  {
    id: "secondary",
    label: "Yhteisö",
    items: [
      { href: "/some", label: "Community", icon: "community" },
      { href: "/fair", label: "Provably Fair", icon: "shield" },
      { href: "/settings", label: "Settings", icon: "settings" },
    ],
  },
  {
    id: "admin",
    label: "Ylläpito",
    items: [{ href: "/admin", label: "Admin", icon: "admin", role: "MODERATOR" }],
  },
];

/** The five destinations that fit a phone's bottom bar. */
export const MOBILE_NAV: NavItem[] = [
  { href: "/home", label: "Home", icon: "home" },
  { href: "/games-hub", label: "Games", icon: "games", match: ["/games/"] },
  { href: "/casino", label: "MineBet", icon: "minebet" },
  { href: "/wallet", label: "Wallet", icon: "wallet" },
  { href: "/profile", label: "Profile", icon: "profile" },
];

export function isActive(pathname: string, item: NavItem): boolean {
  if (pathname === item.href) return true;
  if (item.href !== "/" && pathname.startsWith(`${item.href}/`)) return true;
  return item.match?.some((prefix) => pathname.startsWith(prefix)) ?? false;
}

/** Contextual page titles for the top bar and document metadata. */
export const PAGE_TITLES: { prefix: string; title: string }[] = [
  { prefix: "/home", title: "MineBet" },
  { prefix: "/games-hub", title: "Pelit" },
  { prefix: "/games/slots", title: "Slots" },
  { prefix: "/games/dice", title: "Dice" },
  { prefix: "/games/crash", title: "Crash" },
  { prefix: "/games/mines", title: "Mines" },
  { prefix: "/games/mobgrinder", title: "Mob Grinder" },
  { prefix: "/games/last-hope", title: "Last Hope" },
  { prefix: "/casino", title: "MineBet" },
  { prefix: "/caser", title: "Cases" },
  { prefix: "/battles", title: "Case Battles" },
  { prefix: "/daily-case", title: "Daily Case" },
  { prefix: "/leaderboard", title: "Hall of Legends" },
  { prefix: "/wallet", title: "Lompakko" },
  { prefix: "/fair", title: "Provably Fair" },
  { prefix: "/profile", title: "Profiili" },
  { prefix: "/some", title: "Pekoni Community" },
  { prefix: "/settings", title: "Asetukset" },
  { prefix: "/admin", title: "Command Center" },
];

export function pageTitleFor(pathname: string): string {
  const match = [...PAGE_TITLES]
    .sort((a, b) => b.prefix.length - a.prefix.length)
    .find((entry) => pathname.startsWith(entry.prefix));
  return match?.title ?? "Pekoni";
}
