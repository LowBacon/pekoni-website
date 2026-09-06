/**
 * Builds the GitHub Pages export.
 *
 *   npm run build:static
 *   NEXT_PUBLIC_BASE_PATH=/my-repo npm run build:static
 *
 * GitHub Pages serves static files and nothing else, so this build has to leave
 * the server behind entirely:
 *
 *   1. `src/app/api` is moved aside — route handlers cannot be exported, and in
 *      this build the browser answers those paths itself (src/lib/static).
 *   2. `next build` runs with NEXT_PUBLIC_PEKONI_STATIC=1, which switches
 *      next.config.ts to `output: "export"`.
 *   3. The API directory is restored, `.nojekyll` is written (Pages otherwise
 *      hides `_next/`), and 404.html is pointed at the app so deep links work.
 *
 * `.next` is moved aside for the duration and put back afterwards, the same way
 * the API directory is. Both builds write to `.next`, so without this a static
 * build silently replaces the server build that `next start` serves — and the
 * result is not an obvious failure. Every `/api/*` route is gone and
 * `NEXT_PUBLIC_PEKONI_STATIC=1` is compiled into the client, so the site comes
 * up looking like an *older* version of itself: no sign-in providers, no wallet,
 * no settings panels, and nothing anywhere saying why.
 *
 * The move is always undone, including when the build fails or the process is
 * interrupted — a half-moved source tree would be a nasty thing to leave behind.
 */

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = join(root, "src", "app", "api");
const parkedDir = join(root, ".static-build", "api");
const outDir = join(root, "out");
const serverBuildDir = join(root, ".next");
const parkedBuildDir = join(root, ".static-build", "next");

let moved = false;
let buildMoved = false;

function park() {
  if (existsSync(apiDir)) {
    mkdirSync(dirname(parkedDir), { recursive: true });
    rmSync(parkedDir, { recursive: true, force: true });
    renameSync(apiDir, parkedDir);
    moved = true;
  }

  // Keep the server build intact. Renaming is atomic and cheap; copying a
  // multi-hundred-megabyte build directory would not be.
  if (existsSync(serverBuildDir)) {
    mkdirSync(dirname(parkedBuildDir), { recursive: true });
    rmSync(parkedBuildDir, { recursive: true, force: true });
    renameSync(serverBuildDir, parkedBuildDir);
    buildMoved = true;
  }
}

function restore() {
  if (moved) {
    moved = false;
    rmSync(apiDir, { recursive: true, force: true });
    renameSync(parkedDir, apiDir);
  }

  if (buildMoved) {
    buildMoved = false;
    // Discard whatever the static build left behind, then put the real one back.
    rmSync(serverBuildDir, { recursive: true, force: true });
    renameSync(parkedBuildDir, serverBuildDir);
  }

  rmSync(join(root, ".static-build"), { recursive: true, force: true });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    restore();
    process.exit(1);
  });
}
process.on("exit", restore);

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

console.log("Building the Pekoni static export…");
if (basePath) console.log(`  base path: ${basePath}`);
console.log("  note: this build has no server. Accounts and balances live in the visitor's browser.\n");

park();

const result = spawnSync("npx", ["next", "build"], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    NEXT_PUBLIC_PEKONI_STATIC: "1",
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_TELEMETRY_DISABLED: "1",
  },
});

restore();

if (result.status !== 0) {
  console.error("\nStatic build failed. The API routes have been restored.");
  process.exit(result.status ?? 1);
}

if (!existsSync(outDir)) {
  console.error("\nNext.js reported success but produced no `out/` directory.");
  process.exit(1);
}

// Without this, GitHub Pages runs Jekyll and drops every `_next/*` asset.
writeFileSync(join(outDir, ".nojekyll"), "");

// Deep links land on Pages' 404 handler; serving the app there lets the router
// take over instead of showing GitHub's error page.
const notFound = join(outDir, "404.html");
const indexHtml = join(outDir, "index.html");
if (!existsSync(notFound) && existsSync(indexHtml)) {
  cpSync(indexHtml, notFound);
}

console.log("\nDone — publish the `out/` directory.");
console.log("  local check:  npx serve out");
