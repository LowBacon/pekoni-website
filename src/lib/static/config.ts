/**
 * Build-mode switches.
 *
 * Pekoni ships in two shapes from one source tree:
 *
 *   1. The full product — Next.js server, PostgreSQL/SQLite, server-authoritative
 *      economy. This is the deployment the security model is written for.
 *   2. A static export for GitHub Pages, which cannot run a server at all. There
 *      the browser answers `/api/*` itself from a local demo backend
 *      (see `src/lib/static/backend.ts`). Balances live in that browser only.
 *
 * Everything reads these two constants rather than sniffing the environment, so
 * the difference stays in one place.
 */

/** True only in a build produced by `npm run build:static`. */
export const IS_STATIC = process.env.NEXT_PUBLIC_PEKONI_STATIC === "1";

/** `/repo-name` when the site is served from a GitHub Pages project path. */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Prefixes an app-absolute path with the deployment base path. */
export function withBasePath(path: string): string {
  if (!BASE_PATH || !path.startsWith("/")) return path;
  return `${BASE_PATH}${path}`;
}
