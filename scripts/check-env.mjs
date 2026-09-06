/**
 * Pre-flight check for `npm run dev` and `npm start`.
 *
 * The server build needs a database URL and a session secret. Without them the
 * first request dies inside Prisma and the browser only sees
 * "a server-side exception has occurred" plus a digest — which says nothing
 * about what to do. This runs first and says exactly what is missing.
 *
 * Deliberately not wired into `build`: a production image can supply the
 * environment at run time, and the static export needs no database at all.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env");

/** Reads KEY=VALUE pairs the way Next.js will when it boots. */
function readEnvFile() {
  if (!existsSync(envPath)) return {};
  const values = {};
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return values;
}

const fromFile = readEnvFile();
const value = (key) => process.env[key] ?? fromFile[key] ?? "";

const problems = [];

if (!value("DATABASE_URL")) {
  problems.push("DATABASE_URL is not set — Prisma has no database to talk to.");
}

// `next start` runs with NODE_ENV=production, where auth refuses the dev fallback.
const isProduction = process.argv.includes("--production");
if (isProduction && value("PEKONI_SECRET").length < 32) {
  problems.push("PEKONI_SECRET is missing or shorter than 32 characters.");
}

// A provider with only half its credentials is almost always a typo or a
// half-finished copy-paste. It is not fatal — the button just will not appear —
// so it is reported as a warning rather than a stop.
for (const [name, id, secret] of [
  ["Google", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  ["Discord", "DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET"],
]) {
  const hasId = Boolean(value(id));
  const hasSecret = Boolean(value(secret));
  if (hasId !== hasSecret) {
    console.warn(
      `Warning: ${name} sign-in needs both ${id} and ${secret}. ` +
        `Only ${hasId ? id : secret} is set, so the ${name} button stays hidden.`,
    );
  }
}

// Not fatal: the site runs fine without the game server, it just cannot link
// accounts or move coins — and it tells players that rather than pretending.
{
  const secret = value("PEKONI_PLUGIN_SECRET");
  if (!secret) {
    console.warn(
      "Note: PEKONI_PLUGIN_SECRET is not set, so Minecraft linking and coin " +
        "transfers are disabled. See README > Minecraft plugin integration.",
    );
  } else if (secret.length < 32) {
    problems.push("PEKONI_PLUGIN_SECRET is shorter than 32 characters.");
  }
}

// Neither provider configured means the sign-in page shows only the password
// form. That is a valid deployment, but it is worth saying out loud — otherwise
// the missing buttons read as a bug rather than as unset configuration.
if (!value("GOOGLE_CLIENT_ID") && !value("DISCORD_CLIENT_ID")) {
  console.warn(
    "Note: no sign-in providers configured, so the login page shows only the " +
      "password form. Set GOOGLE_CLIENT_ID/SECRET and/or DISCORD_CLIENT_ID/SECRET " +
      "to enable them. See README > Sign in with Google and Discord.",
  );
}

if (problems.length === 0) process.exit(0);

const copy =
  process.platform === "win32"
    ? "Copy-Item .env.example .env      # PowerShell\n  copy .env.example .env           # cmd.exe"
    : "cp .env.example .env";

console.error(`
Pekoni is not configured yet.

  ${problems.join("\n  ")}

Fix it in two steps:

  1. Create your environment file from the template:

  ${copy}

  2. Create and seed the database:

  npm run setup

Then start again. (Only the server build needs this — the GitHub Pages export,
npm run build:static, has no database and no session at all.)
`);

process.exit(1);
