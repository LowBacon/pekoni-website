import "server-only";
import { prisma } from "./db";

/**
 * Live Minecraft server status.
 *
 * Player counts always come from the public query API — when the lookup fails
 * the card says so. Nothing here ever invents a number, and a stale cache entry
 * is reported with its age rather than presented as live.
 */

const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 6_000;

export type ServerEdition = "JAVA" | "BEDROCK";

export type ServerStatus = {
  edition: ServerEdition;
  host: string;
  address: string;
  online: boolean;
  playersOnline: number | null;
  playersMax: number | null;
  version: string | null;
  motd: string | null;
  /** Set when the last lookup failed — the UI must not show a count then. */
  error: string | null;
  fetchedAt: string;
  stale: boolean;
};

export function serverAddresses() {
  const javaHost = process.env.PEKONI_JAVA_HOST || "Finlandsmp.usga.me";
  const bedrockHost = process.env.PEKONI_BEDROCK_HOST || "Finlandsmp.usga.me";
  const bedrockPort = process.env.PEKONI_BEDROCK_PORT || "12009";
  return {
    java: { host: javaHost, address: javaHost },
    bedrock: { host: bedrockHost, address: `${bedrockHost}:${bedrockPort}`, port: bedrockPort },
  };
}

type ApiResponse = {
  online?: boolean;
  players?: { online?: number; max?: number };
  version?: string | { name_clean?: string };
  motd?: { clean?: string[] };
};

async function queryApi(host: string, edition: ServerEdition): Promise<{
  online: boolean;
  playersOnline: number | null;
  playersMax: number | null;
  version: string | null;
  motd: string | null;
  error: string | null;
}> {
  const base = edition === "BEDROCK" ? "bedrock/3" : "3";
  const url = `https://api.mcsrvstat.us/${base}/${encodeURIComponent(host)}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Pekoni/1.0 (server status card)" },
      cache: "no-store",
    });
    clearTimeout(timer);

    if (!response.ok) {
      return {
        online: false,
        playersOnline: null,
        playersMax: null,
        version: null,
        motd: null,
        error: `Kyselypalvelu vastasi ${response.status}`,
      };
    }

    const data = (await response.json()) as ApiResponse;
    const online = data.online === true;
    const version =
      typeof data.version === "string" ? data.version : data.version?.name_clean ?? null;

    return {
      online,
      playersOnline: online ? data.players?.online ?? null : null,
      playersMax: online ? data.players?.max ?? null : null,
      version,
      motd: data.motd?.clean?.join(" ")?.trim() || null,
      error: null,
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Kysely aikakatkaistiin"
        : "Palvelimeen ei saatu yhteyttä";
    return {
      online: false,
      playersOnline: null,
      playersMax: null,
      version: null,
      motd: null,
      error: message,
    };
  }
}

async function statusFor(host: string, address: string, edition: ServerEdition): Promise<ServerStatus> {
  const cached = await prisma.serverStatusCache.findUnique({ where: { host } });
  const fresh = cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS;

  if (cached && fresh) {
    return {
      edition,
      host,
      address,
      online: cached.online,
      playersOnline: cached.playersOnline,
      playersMax: cached.playersMax,
      version: cached.version,
      motd: cached.motd,
      error: cached.lastError,
      fetchedAt: cached.fetchedAt.toISOString(),
      stale: false,
    };
  }

  const result = await queryApi(host, edition);
  const record = await prisma.serverStatusCache.upsert({
    where: { host },
    create: {
      host,
      edition,
      online: result.online,
      playersOnline: result.playersOnline,
      playersMax: result.playersMax,
      version: result.version,
      motd: result.motd,
      lastError: result.error,
    },
    update: {
      edition,
      online: result.online,
      playersOnline: result.playersOnline,
      playersMax: result.playersMax,
      version: result.version,
      motd: result.motd,
      lastError: result.error,
      fetchedAt: new Date(),
    },
  });

  return {
    edition,
    host,
    address,
    online: record.online,
    playersOnline: record.playersOnline,
    playersMax: record.playersMax,
    version: record.version,
    motd: record.motd,
    error: record.lastError,
    fetchedAt: record.fetchedAt.toISOString(),
    stale: false,
  };
}

export async function getServerStatus(): Promise<{
  java: ServerStatus;
  bedrock: ServerStatus;
  online: boolean;
  playersOnline: number | null;
}> {
  const addresses = serverAddresses();
  const [java, bedrock] = await Promise.all([
    statusFor(addresses.java.host, addresses.java.address, "JAVA"),
    statusFor(`${addresses.bedrock.host}:${addresses.bedrock.port}`, addresses.bedrock.address, "BEDROCK"),
  ]);

  // The two editions usually share one player pool; report the one we could read.
  const playersOnline = java.online
    ? java.playersOnline
    : bedrock.online
      ? bedrock.playersOnline
      : null;

  return { java, bedrock, online: java.online || bedrock.online, playersOnline };
}
