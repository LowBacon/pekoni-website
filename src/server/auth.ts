import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "./db";
import { randomSeed, hashSeed } from "./rng";
import { applyLedgerEntry } from "./wallet";
import { hasRole, type Role } from "@/lib/enums";

export const SESSION_COOKIE = "pekoni_session";
const SESSION_TTL_DAYS = 30;

// --- password hashing ------------------------------------------------------
// scrypt from node:crypto — no native build step, memory-hard, and the cost
// parameters are stored alongside the hash so they can be raised later.

const SCRYPT_N = 16384;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const KEY_LEN = 64;

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password.normalize("NFKC"),
      salt,
      KEY_LEN,
      { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p, maxmem: 64 * 1024 * 1024 },
      (err, derived) => (err ? reject(err) : resolve(derived)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt);
  return `scrypt$${SCRYPT_N}$${SCRYPT_r}$${SCRYPT_p}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, n, r, p, saltB64, hashB64] = stored.split("$");
    if (scheme !== "scrypt") return false;
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const derived = await new Promise<Buffer>((resolve, reject) => {
      crypto.scrypt(
        password.normalize("NFKC"),
        salt,
        expected.length,
        { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 },
        (err, out) => (err ? reject(err) : resolve(out)),
      );
    });
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

// --- sessions --------------------------------------------------------------

function secret(): string {
  const value = process.env.PEKONI_SECRET;
  if (!value || value.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("PEKONI_SECRET must be set to at least 32 characters in production");
    }
    return "pekoni-development-secret-fallback-value-0000";
  }
  return value;
}

/** The raw token lives only in the cookie; the database stores an HMAC of it. */
function tokenHash(token: string): string {
  return crypto.createHmac("sha256", secret()).update(token).digest("hex");
}

export async function createSession(userId: string, userAgent?: string): Promise<void> {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      tokenHash: tokenHash(token),
      userId,
      userAgent: userAgent?.slice(0, 255),
      expiresAt,
    },
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session
      .deleteMany({ where: { tokenHash: tokenHash(token) } })
      .catch(() => undefined);
  }
  store.delete(SESSION_COOKIE);
}

export type SessionUser = {
  id: string;
  username: string;
  role: string;
  status: string;
  level: number;
  xp: number;
  balance: number;
  minecraftUsername: string | null;
  avatarUrl: string | null;
  /** Provider display name, when one exists. Null for password-only accounts. */
  displayName: string | null;
  soundEnabled: boolean;
  reducedMotion: boolean;
  publicActivity: boolean;
  serverSeedHash: string;
  clientSeed: string;
  createdAt: Date;
  lastSeenAt: Date;
  /** False for accounts that only sign in through Google or Discord. */
  hasPassword: boolean;
};

/**
 * Deduped per request. Returns null for anonymous visitors.
 *
 * The projection is explicit rather than a full row: this runs on every request
 * that renders a shell, and `serverSeed` and `passwordHash` have no business
 * being loaded — let alone travelling one layer further by accident.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: tokenHash(token) },
    select: {
      id: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          username: true,
          role: true,
          status: true,
          level: true,
          xp: true,
          minecraftUsername: true,
          avatarUrl: true,
          soundEnabled: true,
          reducedMotion: true,
          publicActivity: true,
          serverSeedHash: true,
          clientSeed: true,
          createdAt: true,
          lastSeenAt: true,
          passwordHash: true,
          wallet: { select: { balance: true } },
          /*
            A real name, when a provider gave us one.

            `username` is a handle somebody chose; greeting a player as
            "Welcome, LowBacon" is not a personal touch, it is the site reading
            their login back at them. Only a provider display name counts as a
            name, and when there is none the greeting simply drops the name.
          */
          oauthAccounts: {
            where: { displayName: { not: null } },
            select: { displayName: true },
            orderBy: { createdAt: "asc" },
            take: 1,
          },
        },
      },
    },
  });

  if (!session) return null;

  if (session.expiresAt < new Date()) {
    // Expired rows would otherwise accumulate forever; drop this one on sight.
    void prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  // A suspended account still resolves here — the app shell needs the identity
  // to render the "account frozen" screen. `requireUser` is what refuses it.
  const user = session.user;
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    status: user.status,
    level: user.level,
    xp: user.xp,
    balance: user.wallet?.balance ?? 0,
    minecraftUsername: user.minecraftUsername,
    avatarUrl: user.avatarUrl,
    displayName: user.oauthAccounts[0]?.displayName ?? null,
    soundEnabled: user.soundEnabled,
    reducedMotion: user.reducedMotion,
    publicActivity: user.publicActivity,
    serverSeedHash: user.serverSeedHash,
    clientSeed: user.clientSeed,
    createdAt: user.createdAt,
    lastSeenAt: user.lastSeenAt,
    hasPassword: user.passwordHash !== null,
  };
});

/**
 * Presence tracking for the admin DAU/WAU figures.
 *
 * Called from the app layout, i.e. on every navigation. Writing `lastSeenAt`
 * that often turns a read-only page load into a database write for no gain, so
 * it is coalesced to one write per window.
 */
const PRESENCE_WINDOW_MS = 5 * 60 * 1000;

export function touchLastSeen(user: Pick<SessionUser, "id" | "lastSeenAt">): void {
  if (Date.now() - user.lastSeenAt.getTime() < PRESENCE_WINDOW_MS) return;
  void prisma.user
    .update({ where: { id: user.id }, data: { lastSeenAt: new Date() } })
    .catch(() => undefined);
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

/** Throws unless a healthy, active session exists. Use in every mutating route. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Kirjaudu sisään jatkaaksesi.", 401);
  if (user.status === "SUSPENDED") {
    throw new AuthError("Tilisi on jäädytetty. Ota yhteyttä ylläpitoon.", 403);
  }
  return user;
}

/**
 * Server-side authorisation. Frontend visibility is never the control — every
 * admin API route calls this.
 */
export async function requireRole(atLeast: Role): Promise<SessionUser> {
  const user = await requireUser();
  if (!hasRole(user.role, atLeast)) {
    throw new AuthError("Ei käyttöoikeutta.", 403);
  }
  return user;
}

// --- account creation ------------------------------------------------------

export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/;

/** The coin grant every new account starts with, however it was created. */
export const STARTING_BALANCE = 1_000;

export async function createUser(input: {
  username: string;
  /** Null creates an account that can only sign in through a linked provider. */
  password: string | null;
  email?: string | null;
  minecraftUsername?: string | null;
  avatarUrl?: string | null;
}) {
  const serverSeed = randomSeed();
  const passwordHash = input.password === null ? null : await hashPassword(input.password);
  const ownerName = process.env.PEKONI_OWNER_USERNAME?.trim().toLowerCase();
  const isOwner = !!ownerName && ownerName === input.username.toLowerCase();

  /*
    The wallet opens at zero and the starting coins arrive as a ledger entry.

    Creating it at 1 000 directly would be one line shorter and would quietly
    break the invariant the whole ledger exists to provide: that the sum of a
    player's entries equals their balance. An audit would then have to know
    about an invisible opening grant to reconcile — which is exactly the kind of
    special case that hides a real discrepancy later.
  */
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        username: input.username,
        usernameLower: input.username.toLowerCase(),
        email: input.email || null,
        passwordHash,
        // Written exactly as given — the caller decides whether an absent
        // Minecraft name should default to the Pekoni username.
        minecraftUsername: input.minecraftUsername || null,
        avatarUrl: input.avatarUrl || null,
        role: isOwner ? "OWNER" : "USER",
        serverSeed,
        serverSeedHash: hashSeed(serverSeed),
        clientSeed: randomSeed(8),
        wallet: { create: { balance: 0 } },
        stats: { create: {} },
      },
    });

    await applyLedgerEntry(tx, user.id, {
      type: "SIGNUP_BONUS",
      amount: STARTING_BALANCE,
      source: "signup",
      metadata: { reason: "Uuden tilin aloituspalkkio" },
    });

    return tx.user.findUniqueOrThrow({ where: { id: user.id }, include: { wallet: true } });
  });
}

/**
 * Turns a provider display name into a Pekoni username that satisfies
 * USERNAME_PATTERN and is not taken.
 *
 * Provider names carry spaces, dots, accents and emoji, and two people called
 * "Matti" will both arrive eventually — so the seed is sanitised and then a
 * numeric suffix is tried. After a few collisions it stops guessing and appends
 * random characters, which terminates rather than scanning forever.
 */
export async function deriveUsername(seed: string): Promise<string> {
  const base =
    seed
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9_]/g, "")
      .slice(0, 12) || "Kulkija";

  const padded = base.length >= 3 ? base : `${base}${randomSeed(2)}`.slice(0, 12);

  const candidates = [padded, ...Array.from({ length: 6 }, (_, i) => `${padded}${i + 2}`)];
  const taken = new Set(
    (
      await prisma.user.findMany({
        where: { usernameLower: { in: candidates.map((c) => c.toLowerCase()) } },
        select: { usernameLower: true },
      })
    ).map((row) => row.usernameLower),
  );

  const free = candidates.find((candidate) => !taken.has(candidate.toLowerCase()));
  if (free) return free;

  // Fall back to randomness, which no longer depends on how many people share
  // the name. Unique-constraint collisions past this are effectively impossible.
  return `${padded.slice(0, 10)}${randomSeed(3)}`.slice(0, 16);
}
