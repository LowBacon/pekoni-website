import type { Metadata, Viewport } from "next";
import { Manrope, Instrument_Serif, JetBrains_Mono } from "next/font/google";
/*
 * Order matters: the component layer must load after the base layer so its
 * motion rules win on equal specificity. An `@import` inside globals.css
 * cannot achieve that — CSS requires imports at the top of the file, which put
 * it first and let every base rule override it.
 */
import "./globals.css";
import "./minebet.css";
import { IS_STATIC } from "@/lib/static/config";
import PreferencesProvider from "@/components/providers/PreferencesProvider";
import ToastProvider from "@/components/providers/ToastProvider";
import PlayerProvider from "@/components/providers/PlayerProvider";
import StaticBackend from "@/components/providers/StaticBackend";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
  weight: ["400", "500", "600"],
});

const instrument = Instrument_Serif({
  subsets: ["latin"],
  variable: "--font-instrument",
  display: "swap",
  weight: ["400"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://pekoni.local"),
  title: {
    default: "Pekoni | Minecraft Gaming Community",
    template: "%s",
  },
  description:
    "Pekoni is a cinematic Minecraft-inspired community and gaming platform featuring MineBet minigames, progression, cases, leaderboards and virtual Pekoni Coins.",
  applicationName: "Pekoni",
  keywords: ["Pekoni", "MineBet", "Minecraft", "yhteisö", "pelit", "Pekoni Coins"],
  openGraph: {
    title: "Pekoni | Minecraft Gaming Community",
    description:
      "Pelaa, kehity ja rakenna oma tarinasi Pekoni-yhteisössä. MineBet-pelit, caset, leaderboardit ja Pekoni Coins.",
    siteName: "Pekoni",
    type: "website",
    locale: "fi_FI",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#080B09",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * The signed-in user, when there is a server to ask.
 *
 * The static export has none — it renders signed-out shells and the browser
 * hydrates them from the local backend — so the auth module is imported lazily
 * and never evaluated in that build.
 */
async function loadUser() {
  if (IS_STATIC) return null;
  const { getCurrentUser } = await import("@/server/auth");
  return getCurrentUser();
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await loadUser();

  return (
    <html
      lang="fi"
      className={`${manrope.variable} ${instrument.variable} ${jetbrains.variable}`}
      data-reduced-motion={user?.reducedMotion ? "true" : "false"}
      suppressHydrationWarning
    >
      <body className="antialiased">
        <PreferencesProvider
          initial={{
            soundEnabled: user?.soundEnabled ?? false,
            reducedMotion: user?.reducedMotion ?? false,
          }}
        >
          <ToastProvider>
            <PlayerProvider
              initial={
                user
                  ? {
                      id: user.id,
                      username: user.username,
                      role: user.role,
                      minecraftUsername: user.minecraftUsername,
                      avatarUrl: user.avatarUrl,
                      balance: user.balance,
                      level: user.level,
                      xp: user.xp,
                    }
                  : null
              }
            >
              {children}
              <StaticBackend />
            </PlayerProvider>
          </ToastProvider>
        </PreferencesProvider>
      </body>
    </html>
  );
}
