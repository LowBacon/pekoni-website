import type { NextConfig } from "next";

/**
 * Pekoni builds in two shapes from one source tree.
 *
 *   npm run build         → the full product: Next.js server, database, sessions
 *                           and a server-authoritative economy.
 *   npm run build:static  → a static export for GitHub Pages, which cannot run a
 *                           server at all. There the browser answers `/api/*`
 *                           itself (src/lib/static) and balances live in that
 *                           one browser.
 *
 * `NEXT_PUBLIC_PEKONI_STATIC` is the only switch; everything downstream reads it
 * through `src/lib/static/config.ts`.
 */
const isStatic = process.env.NEXT_PUBLIC_PEKONI_STATIC === "1";

/** `/repo-name` when served from a GitHub Pages project path. */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // The static export has no image optimiser behind it.
    unoptimized: isStatic,
    remotePatterns: [
      { protocol: "https", hostname: "mc-heads.net" },
      { protocol: "https", hostname: "crafatar.com" },
      // Portraits from a linked account.
      { protocol: "https", hostname: "cdn.discordapp.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },

  // Trims a measurable slice off the first load: these packages are re-exported
  // barrels, and without this the whole barrel is pulled into the client bundle
  // for the handful of symbols that are actually used.
  experimental: {
    optimizePackageImports: ["zod"],
  },

  ...(isStatic
    ? {
        output: "export" as const,
        trailingSlash: true,
        basePath: basePath || undefined,
        assetPrefix: basePath || undefined,
      }
    : {
        async headers() {
          return [
            {
              source: "/:path*",
              headers: [
                { key: "X-Content-Type-Options", value: "nosniff" },
                { key: "X-Frame-Options", value: "DENY" },
                { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
                {
                  key: "Permissions-Policy",
                  value: "camera=(), microphone=(), geolocation=(), payment=()",
                },
                // The session cookie is `secure` in production; this closes the
                // one plaintext request that would otherwise happen first.
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains",
                },
                // Two extra origins on the critical path for avatars and fonts.
                // Warming them costs nothing and saves a full handshake each.
                { key: "X-DNS-Prefetch-Control", value: "on" },
              ],
            },
            {
              // Every response under /api is per-player and already sends
              // `no-store` where it matters. Saying so once, here, keeps a proxy
              // or a browser from ever holding one player's balance for another.
              source: "/api/:path*",
              headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
            },
            {
              // Content-addressed by the build, so it can be cached forever.
              source: "/_next/static/:path*",
              headers: [
                { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
              ],
            },
          ];
        },
      }),
};

export default nextConfig;
