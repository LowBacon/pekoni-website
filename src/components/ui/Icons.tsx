import type { SVGProps } from "react";

/**
 * Interface icons. Stroke-based, 24 × 24, 1.6 units — drawn to sit quietly
 * beside 14px text without shouting.
 */

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const UI_PATHS: Record<string, string> = {
  home: "M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z",
  games: "M7 8h10a4 4 0 0 1 4 4v3a3 3 0 0 1-5.4 1.8L14.5 15h-5l-1.1 1.8A3 3 0 0 1 3 15v-3a4 4 0 0 1 4-4zM7.5 11v2.5M6.25 11.75h2.5M16 11.5v.01M18 13.5v.01",
  minebet: "M12 3 4 7.5v9L12 21l8-4.5v-9zM12 3v18M4 7.5l8 4.5 8-4.5",
  cases: "M3.5 9.5h17v9a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5zM3.5 9.5 6 4h12l2.5 5.5M12 4v5.5M10 13.5h4",
  battles: "M5 4l9.5 9.5M19 4l-9.5 9.5M4 17l3 3 3-3-3-3zM20 17l-3 3-3-3 3-3zM7 20l10-10M17 20 7 10",
  daily: "M12 3v2.5M12 18.5V21M4.2 12H6.7M17.3 12h2.5M6.3 6.3l1.8 1.8M15.9 15.9l1.8 1.8M6.3 17.7l1.8-1.8M15.9 8.1l1.8-1.8M12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z",
  leaderboard: "M6 20V12M12 20V5M18 20v-6M3.5 20h17",
  profile: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0",
  community: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16.5 11.5a3 3 0 1 0 0-6M18 20h3.5a5.5 5.5 0 0 0-3.4-5.1",
  settings: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z",
  admin: "M12 3.5 5 6.2v5.1c0 4.2 2.9 8.1 7 9.2 4.1-1.1 7-5 7-9.2V6.2zM9.3 12l1.9 1.9 3.6-3.7",
  bell: "M18 8.5a6 6 0 0 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5zM13.7 19a2 2 0 0 1-3.4 0",
  volume: "M11 5 6.5 9H3v6h3.5L11 19zM15 9.5a3.5 3.5 0 0 1 0 5M17.8 6.8a7.5 7.5 0 0 1 0 10.4",
  volumeOff: "M11 5 6.5 9H3v6h3.5L11 19zM16 10l4 4M20 10l-4 4",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6 6 18",
  chevronRight: "m9.5 5.5 6.5 6.5-6.5 6.5",
  chevronLeft: "m14.5 5.5-6.5 6.5 6.5 6.5",
  chevronDown: "m5.5 9.5 6.5 6.5 6.5-6.5",
  chevronUp: "m5.5 14.5 6.5-6.5 6.5 6.5",
  arrowRight: "M4.5 12h15M13.5 6l6 6-6 6",
  logout: "M15.5 8V6a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-2M10 12h10.5M17 8.5l3.5 3.5-3.5 3.5",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  check: "m5 12.5 4.5 4.5L19 7",
  copy: "M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1",
  external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM16.2 16.2 21 21",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  eyeOff: "M4 4l16 16M9.9 5.9A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.3 4M6.3 8.1A17.2 17.2 0 0 0 2.5 12S6 18.5 12 18.5c1.2 0 2.3-.2 3.2-.6M9.9 9.9a3 3 0 0 0 4.2 4.2",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5.2l3.2 2",
  trophy: "M7 4h10v5a5 5 0 0 1-10 0zM7 6H4.5v1.5A3.5 3.5 0 0 0 8 11M17 6h2.5v1.5A3.5 3.5 0 0 1 16 11M12 14v3.5M8.5 20.5h7",
  coin: "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM12 7.5v9M14.6 9.6a3 3 0 1 0 0 4.8",
  spark: "M12 3.5 13.9 9l5.6 1.9-5.6 2L12 18.5 10.1 12.9 4.5 11l5.6-2z",
  shield: "M12 3.5 5.5 6v6c0 3.8 2.7 7.3 6.5 8.5 3.8-1.2 6.5-4.7 6.5-8.5V6z",
  fire: "M12 21c3.6 0 6-2.4 6-5.6 0-3.9-3.2-5.4-3.2-8.9 0 0-2.4 1.3-2.4 4.2 0 1.4-.8 2-1.6 2-1 0-1.6-.8-1.6-2.2C8 12 6 12.7 6 15.4 6 18.6 8.4 21 12 21z",
  refresh: "M20 12a8 8 0 1 1-2.6-5.9M20 4v4.5h-4.5",
  filter: "M4 6h16M7 12h10M10 18h4",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 7.8v.1",
  warning: "M10.3 4.3 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0zM12 9v4.5M12 17v.1",
  lock: "M6.5 10.5h11a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-8.5a1 1 0 0 1 1-1zM8.5 10.5V7a3.5 3.5 0 1 1 7 0v3.5",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0",
  server: "M4 5h16v5H4zM4 14h16v5H4zM7.5 7.5v.01M7.5 16.5v.01",
  play: "M8 5.5 18.5 12 8 18.5z",
  pause: "M9 5.5v13M15 5.5v13",
  bolt: "M13.5 3 6 13.5h5L10.5 21 18 10.5h-5z",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 13.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4z",
  history: "M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 4.5V9H8M12 7.5v5l3 1.8",
  wallet: "M4 7.5h13a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6.5A2 2 0 0 1 5 4.5h10M16.5 13.5v.01",
  chart: "M4 20V9M9.5 20V4M15 20v-7M20.5 20v-4",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16.5 11.5a3 3 0 1 0 0-6M18 20h3.5a5.5 5.5 0 0 0-3.4-5.1",
  logs: "M5 4h14v16H5zM8.5 8.5h7M8.5 12h7M8.5 15.5h4",
};

export function Icon({ name, size = 20, ...props }: IconProps & { name: keyof typeof UI_PATHS | string }) {
  const path = UI_PATHS[name] ?? UI_PATHS.info;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={path} />
    </svg>
  );
}

export type UiIconName = keyof typeof UI_PATHS;

/**
 * Item and achievement emblems. These are filled rather than stroked so they
 * read as collectible objects rather than interface affordances, and each takes
 * the rarity colour of whatever it represents.
 */

type Glyph = { paths: string[]; accents?: string[] };

const GLYPHS: Record<string, Glyph> = {
  // --- ores, gems, currency ---
  diamond: { paths: ["M12 3 20 10.5 12 21 4 10.5z"], accents: ["M12 3 8 10.5 12 21 16 10.5z"] },
  emerald: { paths: ["M7 5h10l3 5-8 9-8-9z"], accents: ["M7 5l2.5 5h5L17 5M4 10h16"] },
  crystal: { paths: ["M12 2 17 9l-2 12H9L7 9z"], accents: ["M7 9h10M12 2v19"] },
  quartz: { paths: ["M6 8l6-5 6 5-2 11H8z"], accents: ["M6 8h12"] },
  ingot: { paths: ["M4 15h16l-2.5-6h-11z"], accents: ["M6.5 9h11"] },
  netherite: { paths: ["M4 14.5h16l-2-6H6zM6 18h12v2H6z"], accents: ["M9 8.5V6h6v2.5"] },
  coal: { paths: ["M5 12.5 8.5 6h7L19 12.5 15.5 19h-7z"] },
  gravel: { paths: ["M5 16.5 8 12l3.5 4.5zM11.5 16.5 15 10.5l4 6z"], accents: ["M4 19.5h16"] },
  moss: { paths: ["M4.5 17c0-3.5 2.5-6 5-6.5 1-2.5 3-4 5.5-4 3 0 4.5 2 4.5 4.5 0 3.5-3 6-7.5 6z"], accents: ["M9 14.5c1.5-1 3-1.5 5-1.5"] },
  obsidian: { paths: ["M6 6h12v12H6z"], accents: ["M6 6l12 12M18 6 6 18"] },
  ember: { paths: ["M12 21c3.4 0 5.8-2.3 5.8-5.4 0-3.8-3.1-5.2-3.1-8.6 0 0-2.3 1.2-2.3 4 0 1.4-.8 2-1.6 2-1 0-1.5-.8-1.5-2.1 0 1.4-1.9 2.1-1.9 4.7C7.4 18.7 8.6 21 12 21z"] },
  lapis: { paths: ["M12 3.5 18.5 8v8L12 20.5 5.5 16V8z"], accents: ["M12 3.5V20.5M5.5 8l13 8M18.5 8l-13 8"] },
  redstone: { paths: ["M12 4l7 4v8l-7 4-7-4V8z"], accents: ["M12 8.5v7M8.5 10.5l7 3M15.5 10.5l-7 3"] },
  amber: { paths: ["M12 3c3.5 0 6 3 6 7.5S15 21 12 21s-6-6-6-10.5S8.5 3 12 3z"], accents: ["M12 8.5v6M9.5 11h5"] },
  coin: { paths: ["M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17z"], accents: ["M12 7.5v9M14.6 9.6a3 3 0 1 0 0 4.8"] },
  gem: { paths: ["M12 3 20 10.5 12 21 4 10.5z"], accents: ["M8 10.5h8"] },

  // --- tools, gear ---
  pickaxe: { paths: ["M4 8c4-3 12-3 16 0-3 .5-5.5 1.5-7 3l-2-2C9.5 8.4 7 7.6 4 8z"], accents: ["M11.5 11 6 20.5"] },
  chisel: { paths: ["M14 3.5 20.5 10l-3 3-6.5-6.5z"], accents: ["M11 6.5 4 18l2 2 11.5-7"] },
  sword: { paths: ["M18.5 3.5 9 13l2 2 9.5-9.5z"], accents: ["M7 15l2 2M5.5 16.5 3.5 20.5l4-2M9.5 12.5 11.5 14.5"] },
  bow: { paths: ["M6 3.5C13.5 5 18 10 19.5 20"], accents: ["M6 3.5 19.5 20M6 3.5 20 6M19.5 20 4 18"] },
  shield: { paths: ["M12 3 5 5.8V12c0 4.2 2.9 8 7 9 4.1-1 7-4.8 7-9V5.8z"], accents: ["M12 3v18"] },
  staff: { paths: ["M12 3.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"], accents: ["M12 9.5V20.5M9 20.5h6"] },
  lantern: { paths: ["M8 8h8v9H8z"], accents: ["M10.5 5.5h3M12 3.5v2M7 17.5h10M10.5 10.5v4M13.5 10.5v4"] },
  compass: { paths: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z"], accents: ["M15 9l-2 4-4 2 2-4z"] },
  map: { paths: ["M3.5 6.5 9 4.5l6 2 5.5-2v13l-5.5 2-6-2-5.5 2z"], accents: ["M9 4.5v13M15 6.5v13"] },
  key: { paths: ["M9 5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9z"], accents: ["M12.5 12 20 19.5M17 16.5l-2 2M14.5 14l-2 2"] },
  pack: { paths: ["M6 8h12v12H6z"], accents: ["M9 8V5.5a3 3 0 0 1 6 0V8M6 13h12"] },
  chest: { paths: ["M4 10h16v9H4z"], accents: ["M4 10 6 5h12l2 5M11 13h2v3h-2z"] },
  pedestal: { paths: ["M8 6h8v10H8z"], accents: ["M5.5 20h13M6.5 16h11M7 6h10"] },
  tablet: { paths: ["M6 3.5h12v17H6z"], accents: ["M9 8h6M9 11.5h6M9 15h3"] },

  // --- symbols ---
  rune: { paths: ["M12 2.5 21 8v8l-9 5.5L3 16V8z"], accents: ["M12 7v10M8.5 9.5 12 12l3.5-2.5"] },
  seal: { paths: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z"], accents: ["M12 6.5 14 11l4.5.5-3.4 3 1 4.5L12 16.5 7.9 19l1-4.5-3.4-3L10 11z"] },
  crown: { paths: ["M4 17h16l1-9-5 3.5L12 4 8 11.5 3 8z"], accents: ["M5.5 20h13"] },
  crownStar: { paths: ["M4 17h16l1-9-5 3.5L12 4 8 11.5 3 8z"], accents: ["M5.5 20h13M12 12.5l.9 2 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z"] },
  laurel: { paths: ["M12 21c-4 0-7-3.5-7-8.5C5 7 8 4 12 3c4 1 7 4 7 9.5 0 5-3 8.5-7 8.5z"], accents: ["M12 7.5v10M9 10.5c1 1 2 1.5 3 1.5M15 10.5c-1 1-2 1.5-3 1.5M9 14c1 1 2 1.5 3 1.5M15 14c-1 1-2 1.5-3 1.5"] },
  badge: { paths: ["M12 3.5 19 7v6c0 4-3 6.5-7 7.5-4-1-7-3.5-7-7.5V7z"], accents: ["M9.5 12l1.8 1.8L15 10"] },
  banner: { paths: ["M6 3.5h12V19l-6-3.5L6 19z"], accents: ["M9.5 8h5"] },
  chalice: { paths: ["M7 4h10l-1.5 6a4 4 0 0 1-7 0z"], accents: ["M12 14v4M8.5 20.5h7"] },
  totem: { paths: ["M8 3.5h8v17H8z"], accents: ["M10 7.5h4M9.5 11.5h5M10 15.5h4"] },
  heart: { paths: ["M12 20.5S3.5 15.4 3.5 9.8A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 8.5 2.2c0 5.6-8.5 10.7-8.5 10.7z"] },
  star: { paths: ["M12 3 14.6 9.2 21 9.8l-4.8 4.3 1.4 6.4L12 17.2 6.4 20.5l1.4-6.4L3 9.8l6.4-.6z"] },
  feather: { paths: ["M19 4c-7 0-12 4.5-12 10.5V18l3.5-1c5-1.5 8.5-6.5 8.5-13z"], accents: ["M5 20 12 13"] },
  apple: { paths: ["M12 7c3.5-2 7 0 7 4.5 0 4-2.5 9-5 9-1 0-1.5-.5-2-.5s-1 .5-2 .5c-2.5 0-5-5-5-9C5 7 8.5 5 12 7z"], accents: ["M12 7V4.5M12 4.5c1.5-1.5 3-1.5 3-1.5"] },
  cloak: { paths: ["M8 4 4 8v12h16V8l-4-4-4 3z"], accents: ["M12 7v13"] },
  portal: { paths: ["M12 3c3.9 0 7 4 7 9s-3.1 9-7 9-7-4-7-9 3.1-9 7-9z"], accents: ["M12 7c1.9 0 3.5 2.2 3.5 5s-1.6 5-3.5 5-3.5-2.2-3.5-5 1.6-5 3.5-5z"] },
  stack: { paths: ["M12 3.5 21 8l-9 4.5L3 8z"], accents: ["M3 12l9 4.5L21 12M3 16l9 4.5L21 16"] },
  swords: { paths: ["M18.5 3.5 9 13l2 2 9.5-9.5z", "M5.5 3.5 15 13l-2 2L3.5 5.5z"], accents: ["M5.5 16.5 3.5 20.5l4-2M18.5 16.5l2 4-4-2"] },
  skull: { paths: ["M12 3.5c4.1 0 7 2.9 7 6.8 0 2.6-1 4.2-2.5 5.2v2.5a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V15.5C6 14.5 5 12.9 5 10.3c0-3.9 2.9-6.8 7-6.8z"], accents: ["M9.5 10.5v.01M14.5 10.5v.01M11 14h2"] },
  shrine: { paths: ["M12 3 4 8v12h16V8z"], accents: ["M9 20v-6h6v6M2.5 8h19"] },
  flame: { paths: ["M12 21c3.6 0 6-2.4 6-5.6 0-3.9-3.2-5.4-3.2-8.9 0 0-2.4 1.3-2.4 4.2 0 1.4-.8 2-1.6 2-1 0-1.6-.8-1.6-2.2C8 12 6 12.7 6 15.4 6 18.6 8.4 21 12 21z"] },
  clover: { paths: ["M12 12c0-3 1-5 3-5s3 1.5 3 3.5S16 14 12 12zM12 12c0 3-1 5-3 5s-3-1.5-3-3.5S8 10 12 12zM12 12c-3 0-5-1-5-3s1.5-3 3.5-3S14 8 12 12zM12 12c3 0 5 1 5 3s-1.5 3-3.5 3S10 16 12 12z"] },
  cloud: { paths: ["M7.5 18a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 18 10.6a3.7 3.7 0 0 1-.5 7.4z"] },
  reel: { paths: ["M4 5.5h16v13H4z"], accents: ["M9.5 5.5v13M14.5 5.5v13M4 12h16"] },
  summit: { paths: ["M2.5 19 9 7l3.5 6L15 9l6.5 10z"], accents: ["M9 7l1.5 2.8"] },
  gravelStone: { paths: ["M5 16.5 8 12l3.5 4.5z"] },
};

export function ItemIcon({
  name,
  size = 40,
  color = "currentColor",
  className,
}: {
  name: string;
  size?: number;
  color?: string;
  className?: string;
}) {
  const glyph = GLYPHS[name] ?? GLYPHS.rune;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {glyph.paths.map((d, index) => (
        <path
          key={`f${index}`}
          d={d}
          fill={color}
          fillOpacity={0.16}
          stroke={color}
          strokeWidth={1.3}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      {glyph.accents?.map((d, index) => (
        <path
          key={`a${index}`}
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={1.1}
          strokeOpacity={0.75}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

export function hasGlyph(name: string): boolean {
  return name in GLYPHS;
}
