import "server-only";
import crypto from "node:crypto";
import { prisma } from "./db";
import { SESSION_COOKIE, hashPassword, verifyPassword } from "./auth";
import { cookies } from "next/headers";

/**
 * Account self-service: sessions, onboarding, and deletion.
 *
 * The theme here is that the player should be able to see and undo everything
 * the site knows about their access. Sessions are listed with enough detail to
 * recognise a device and no more — a coarse user-agent summary, never a raw IP,
 * because a stolen session list should not also be a location history.
 */

export class AccountError extends Error {
  status: number;
  code: string;
  constructor(message: string, code = "ACCOUNT_ERROR", status = 400) {
    super(message);
    this.name = "AccountError";
    this.code = code;
    this.status = status;
  }
}

/* -------------------------------------------------------------------------- */
/* Sessions                                                                   */
/* -------------------------------------------------------------------------- */

export type SessionSummary = {
  id: string;
  device: string;
  browser: string;
  current: boolean;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
};

/** Turns a user-agent string into something a person can recognise. */
export function describeUserAgent(ua: string | null): { device: string; browser: string } {
  if (!ua) return { device: "Tuntematon laite", browser: "Tuntematon selain" };

  const device = /iPhone|iPad|iPod/i.test(ua)
    ? "iPhone tai iPad"
    : /Android/i.test(ua)
      ? "Android-laite"
      : /Macintosh|Mac OS X/i.test(ua)
        ? "Mac"
        : /Windows/i.test(ua)
          ? "Windows-tietokone"
          : /Linux/i.test(ua)
            ? "Linux-tietokone"
            : "Tuntematon laite";

  // Order matters: Edge and Chrome both claim Safari, Chrome claims Safari too.
  const browser = /Edg\//i.test(ua)
    ? "Edge"
    : /OPR\/|Opera/i.test(ua)
      ? "Opera"
      : /Firefox\//i.test(ua)
        ? "Firefox"
        : /Chrome\//i.test(ua)
          ? "Chrome"
          : /Safari\//i.test(ua)
            ? "Safari"
            : "Tuntematon selain";

  return { device, browser };
}

function tokenHashFor(token: string): string {
  const value = process.env.PEKONI_SECRET;
  const secret =
    value && value.length >= 32 ? value : "pekoni-development-secret-fallback-value-0000";
  return crypto.createHmac("sha256", secret).update(token).digest("hex");
}

export async function listSessions(userId: string): Promise<SessionSummary[]> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const currentHash = token ? tokenHashFor(token) : null;

  const rows = await prisma.session.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { lastUsedAt: "desc" },
    select: {
      id: true,
      tokenHash: true,
      userAgent: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
    },
  });

  return rows.map((row) => {
    const { device, browser } = describeUserAgent(row.userAgent);
    return {
      id: row.id,
      device,
      browser,
      current: currentHash !== null && row.tokenHash === currentHash,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastUsedAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    };
  });
}

export async function revokeSession(userId: string, sessionId: string): Promise<void> {
  // Scoped to the owner, so a guessed id cannot log somebody else out.
  const result = await prisma.session.deleteMany({ where: { id: sessionId, userId } });
  if (result.count === 0) {
    throw new AccountError("Istuntoa ei löytynyt.", "NO_SESSION", 404);
  }
}

/**
 * Signs out everywhere.
 *
 * `keepCurrent` is the difference between "I lost my phone" and "log me out of
 * everything including here" — both are legitimate, so both are offered.
 */
export async function revokeAllSessions(
  userId: string,
  options: { keepCurrent: boolean },
): Promise<number> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const currentHash = token ? tokenHashFor(token) : null;

  const result = await prisma.session.deleteMany({
    where: {
      userId,
      ...(options.keepCurrent && currentHash ? { tokenHash: { not: currentHash } } : {}),
    },
  });

  if (!options.keepCurrent) store.delete(SESSION_COOKIE);
  return result.count;
}

/** Keeps `lastUsedAt` meaningful without a write on every single request. */
const SESSION_TOUCH_WINDOW_MS = 10 * 60 * 1000;

export function touchSession(sessionId: string, lastUsedAt: Date): void {
  if (Date.now() - lastUsedAt.getTime() < SESSION_TOUCH_WINDOW_MS) return;
  void prisma.session
    .update({ where: { id: sessionId }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);
}

/* -------------------------------------------------------------------------- */
/* Passwords                                                                  */
/* -------------------------------------------------------------------------- */

/** Rejects the passwords that actually get accounts taken over. */
export function passwordProblems(password: string, context: { username?: string } = {}): string[] {
  const problems: string[] = [];
  if (password.length < 10) problems.push("Vähintään 10 merkkiä.");
  if (password.length > 200) problems.push("Enintään 200 merkkiä.");
  if (!/[a-zåäö]/i.test(password)) problems.push("Ainakin yksi kirjain.");
  if (!/[0-9]/.test(password) && !/[^A-Za-z0-9]/.test(password)) {
    problems.push("Ainakin yksi numero tai erikoismerkki.");
  }
  if (context.username && password.toLowerCase().includes(context.username.toLowerCase())) {
    problems.push("Salasana ei saa sisältää käyttäjänimeäsi.");
  }
  // A short, blunt list beats a dictionary here: these are what people type.
  const common = [
    "password", "salasana", "123456", "qwerty", "minecraft", "pekoni",
    "letmein", "welcome", "admin123", "iloveyou", "abc123",
  ];
  const lowered = password.toLowerCase();
  if (common.some((entry) => lowered.includes(entry))) {
    problems.push("Salasana on liian arvattava.");
  }
  return problems;
}

/**
 * Sets or changes a password.
 *
 * Changing one revokes every other session: if the reason for the change is
 * that somebody else had the old one, leaving their session alive defeats the
 * point entirely.
 */
export async function changePassword(input: {
  userId: string;
  currentPassword: string | null;
  newPassword: string;
}): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: input.userId },
    select: { passwordHash: true, username: true },
  });

  if (user.passwordHash) {
    if (!input.currentPassword) {
      throw new AccountError("Anna nykyinen salasanasi.", "CURRENT_REQUIRED", 400);
    }
    const valid = await verifyPassword(input.currentPassword, user.passwordHash);
    if (!valid) throw new AccountError("Nykyinen salasana on väärin.", "BAD_CURRENT", 401);
  }

  const problems = passwordProblems(input.newPassword, { username: user.username });
  if (problems.length > 0) {
    throw new AccountError(problems[0], "WEAK_PASSWORD", 400);
  }

  await prisma.user.update({
    where: { id: input.userId },
    data: { passwordHash: await hashPassword(input.newPassword) },
  });

  await revokeAllSessions(input.userId, { keepCurrent: true });

  await prisma.notification.create({
    data: {
      userId: input.userId,
      kind: "INFO",
      title: "Salasana vaihdettu",
      body: "Muut istunnot kirjattiin ulos varmuuden vuoksi.",
      href: "/settings#security",
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Onboarding                                                                 */
/* -------------------------------------------------------------------------- */

export type OnboardingInput = {
  username?: string;
  minecraftUsername?: string | null;
  soundEnabled?: boolean;
  reducedMotion?: boolean;
  publicActivity?: boolean;
};

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/;

/**
 * Finishes first-run setup.
 *
 * The username is the only irreversible-feeling part, so it is validated hard
 * and claimed atomically — two people finishing onboarding at once must not end
 * up with the same name.
 */
export async function completeOnboarding(
  userId: string,
  input: OnboardingInput,
): Promise<{ username: string }> {
  const current = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { username: true, onboardedAt: true },
  });

  const data: Record<string, unknown> = { onboardedAt: new Date() };

  if (input.username && input.username !== current.username) {
    const next = input.username.trim();
    if (!USERNAME_PATTERN.test(next)) {
      throw new AccountError(
        "Käyttäjänimi: 3–16 merkkiä, vain kirjaimia, numeroita ja _.",
        "BAD_USERNAME",
        400,
      );
    }
    const taken = await prisma.user.findUnique({
      where: { usernameLower: next.toLowerCase() },
      select: { id: true },
    });
    if (taken && taken.id !== userId) {
      throw new AccountError("Käyttäjänimi on jo varattu.", "USERNAME_TAKEN", 409);
    }
    data.username = next;
    data.usernameLower = next.toLowerCase();
  }

  if (input.minecraftUsername !== undefined) {
    const value = input.minecraftUsername?.trim() || null;
    if (value && !USERNAME_PATTERN.test(value)) {
      throw new AccountError("Minecraft-nimi: 3–16 merkkiä.", "BAD_MC_NAME", 400);
    }
    data.minecraftUsername = value;
  }
  if (input.soundEnabled !== undefined) data.soundEnabled = input.soundEnabled;
  if (input.reducedMotion !== undefined) data.reducedMotion = input.reducedMotion;
  if (input.publicActivity !== undefined) data.publicActivity = input.publicActivity;

  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: { username: true },
    });
    return { username: updated.username };
  } catch {
    // The unique index is the real arbiter; the check above is just a nicer
    // message for the common case.
    throw new AccountError("Käyttäjänimi on jo varattu.", "USERNAME_TAKEN", 409);
  }
}

/* -------------------------------------------------------------------------- */
/* Deletion                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Deletes the account and everything hanging off it.
 *
 * Refused while coins are still in flight to the game server: those are already
 * debited and about to be credited in game, and deleting the row the plugin is
 * about to confirm would strand them. The player is asked to wait — minutes, not
 * days — rather than losing the coins silently.
 *
 * The public activity feed is scrubbed too. Cascades handle the rest.
 */
export async function deleteAccount(userId: string, confirmation: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { username: true, role: true },
  });

  if (confirmation.trim().toLowerCase() !== user.username.toLowerCase()) {
    throw new AccountError(
      "Kirjoita käyttäjänimesi täsmälleen oikein vahvistaaksesi.",
      "BAD_CONFIRMATION",
      400,
    );
  }

  if (user.role === "OWNER") {
    throw new AccountError(
      "Omistajatiliä ei voi poistaa itsepalveluna.",
      "OWNER_PROTECTED",
      409,
    );
  }

  const inFlight = await prisma.transfer.count({
    where: { userId, status: { in: ["PENDING", "CLAIMED"] } },
  });
  if (inFlight > 0) {
    throw new AccountError(
      "Sinulla on siirtoja kesken. Odota niiden valmistumista ja yritä uudelleen.",
      "TRANSFERS_PENDING",
      409,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.activityEvent.deleteMany({ where: { userId } });
    await tx.user.delete({ where: { id: userId } });
  });

  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
