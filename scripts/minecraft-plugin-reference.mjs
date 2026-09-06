#!/usr/bin/env node
/**
 * Reference client for the Pekoni ↔ Minecraft plugin API.
 *
 * This is NOT a mock and it does not fabricate anything: every call below is a
 * real, signed HTTP request against a running Pekoni server, and the answers it
 * prints are that server's. Its two jobs are:
 *
 *   1. To be the executable specification for whoever writes the actual
 *      Bukkit/Paper plugin — the signing scheme is the fiddly part, and it is
 *      implemented here in about twenty lines.
 *   2. To let an operator exercise link + transfer end to end before a real
 *      plugin exists.
 *
 * Usage (PEKONI_PLUGIN_SECRET must match the server's):
 *
 *   node scripts/minecraft-plugin-reference.mjs link <code> <uuid> <username>
 *   node scripts/minecraft-plugin-reference.mjs claim
 *   node scripts/minecraft-plugin-reference.mjs complete <transferId>
 *   node scripts/minecraft-plugin-reference.mjs fail <transferId> [reason]
 *   node scripts/minecraft-plugin-reference.mjs heartbeat [uuid...]
 *   node scripts/minecraft-plugin-reference.mjs drain      # claim, then complete each
 *
 * Environment:
 *   PEKONI_URL             default http://localhost:3000
 *   PEKONI_PLUGIN_SECRET   the shared signing secret (32+ chars)
 */

import crypto from "node:crypto";

const BASE = (process.env.PEKONI_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const SECRET = process.env.PEKONI_PLUGIN_SECRET ?? "";

if (!SECRET || SECRET.length < 32) {
  console.error(
    "PEKONI_PLUGIN_SECRET is missing or shorter than 32 characters.\n" +
      "Generate one with:\n" +
      '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n' +
      "and set the same value in the website's .env and in the plugin config.",
  );
  process.exit(1);
}

/**
 * The signing scheme, in full.
 *
 * canonical = `${timestamp}.${nonce}.${METHOD}.${path}.${sha256hex(body)}`
 * signature = hex HMAC-SHA256(secret, canonical)
 *
 * Method and path are covered so a captured signature cannot be replayed at a
 * different endpoint; the body hash covers the payload; the timestamp bounds the
 * replay window and the nonce closes it.
 */
async function call(path, payload) {
  const body = JSON.stringify(payload ?? {});
  const timestamp = String(Date.now());
  const nonce = crypto.randomBytes(16).toString("hex");
  const bodyHash = crypto.createHash("sha256").update(body).digest("hex");
  const canonical = `${timestamp}.${nonce}.POST.${path}.${bodyHash}`;
  const signature = crypto.createHmac("sha256", SECRET).update(canonical).digest("hex");

  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Pekoni-Timestamp": timestamp,
      "X-Pekoni-Nonce": nonce,
      "X-Pekoni-Signature": signature,
    },
    body,
  });

  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  return { status: response.status, body: parsed };
}

function show(label, result) {
  const mark = result.body?.ok ? "ok " : "ERR";
  console.log(`[${mark}] ${label} → HTTP ${result.status}`);
  console.log(JSON.stringify(result.body, null, 2));
  return result;
}

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case "link": {
    const [code, uuid, username] = args;
    if (!code || !uuid || !username) {
      console.error("usage: link <code> <uuid> <username>");
      process.exit(1);
    }
    show("link", await call("/api/plugin/link", { code, uuid, username }));
    break;
  }

  case "claim": {
    show("claim", await call("/api/plugin/transfers/claim", { limit: 25 }));
    break;
  }

  case "complete": {
    if (!args[0]) {
      console.error("usage: complete <transferId>");
      process.exit(1);
    }
    show("complete", await call("/api/plugin/transfers/complete", { transferId: args[0] }));
    break;
  }

  case "fail": {
    if (!args[0]) {
      console.error("usage: fail <transferId> [reason]");
      process.exit(1);
    }
    show(
      "fail",
      await call("/api/plugin/transfers/fail", {
        transferId: args[0],
        reason: args.slice(1).join(" ") || "Reference client marked this failed.",
      }),
    );
    break;
  }

  case "heartbeat": {
    show("heartbeat", await call("/api/plugin/heartbeat", { online: args }));
    break;
  }

  case "drain": {
    // What a real plugin's tick loop does: claim a batch, credit each player in
    // game, then confirm. Confirming is what actually completes the transfer —
    // a crash between the two leaves the row CLAIMED, and the website refunds
    // it once it goes stale rather than leaving the coins in limbo.
    const claimed = show("claim", await call("/api/plugin/transfers/claim", { limit: 25 }));
    const transfers = claimed.body?.transfers ?? [];
    if (transfers.length === 0) {
      console.log("\nNothing to deliver.");
      break;
    }
    for (const transfer of transfers) {
      console.log(
        `\n-- would run in game: give ${transfer.amount} coins to ${transfer.username} (${transfer.uuid})`,
      );
      show(`complete ${transfer.reference}`, await call("/api/plugin/transfers/complete", {
        transferId: transfer.id,
      }));
    }
    break;
  }

  default:
    console.error(
      "commands: link | claim | complete | fail | heartbeat | drain\n" +
        "see the header of this file for usage",
    );
    process.exit(1);
}
