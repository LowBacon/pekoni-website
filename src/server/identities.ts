import "server-only";
import { prisma } from "./db";
import { createUser, deriveUsername } from "./auth";
import { OAuthError, type OAuthProfile } from "./oauth";
import { providerKey, type OAuthProvider } from "@/lib/oauth";

/**
 * Where a third-party profile becomes a Pekoni account.
 *
 * Two questions, answered in this order, and the order is the security model:
 *
 *   1. Is this exact provider account already linked? Then it is that user,
 *      full stop. The key is the provider's account id, so changing a Discord
 *      name or a Google e-mail cannot move the link.
 *   2. Is somebody signed in right now? Then this is a *link*, not a login, and
 *      it attaches to that session's user.
 *
 * Otherwise a fresh account is created. Accounts are never merged on a matching
 * e-mail address, not even a provider-verified one: an address is a routing
 * label, not proof of possession of a Pekoni account, and silently joining two
 * identities because they share one is how account-takeover bugs happen. A
 * player who wants both providers on one account signs in with the first and
 * links the second from settings, where they have already authenticated.
 *
 * The cost is a duplicate account when somebody forgets which button they used
 * last time. That case is handled by telling them — a notification on the new
 * account explains what happened and how to reach the old one — rather than by
 * guessing on their behalf.
 */

export type LinkedAccount = {
  provider: OAuthProvider;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  linkedAt: string;
};

export type SignInOutcome = {
  userId: string;
  /** True when this sign-in created the account, so the UI can welcome them. */
  created: boolean;
};

/** Providers currently linked to an account, oldest first. */
export async function linkedAccounts(userId: string): Promise<LinkedAccount[]> {
  const rows = await prisma.oAuthAccount.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      provider: true,
      displayName: true,
      email: true,
      avatarUrl: true,
      createdAt: true,
    },
  });

  return rows.map((row) => ({
    provider: row.provider.toLowerCase() as OAuthProvider,
    displayName: row.displayName,
    email: row.email,
    avatarUrl: row.avatarUrl,
    linkedAt: row.createdAt.toISOString(),
  }));
}

/** The profile snapshot stored alongside a link. Display only. */
function snapshot(profile: OAuthProfile) {
  return {
    email: profile.email,
    emailVerified: profile.emailVerified,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
  };
}

/**
 * Attaches a provider account to an already signed-in user.
 *
 * Refuses when the provider account belongs to somebody else — that would
 * silently give two Pekoni accounts one key, and the next sign-in would land on
 * whichever row was found first.
 */
export async function linkProvider(
  userId: string,
  provider: OAuthProvider,
  profile: OAuthProfile,
): Promise<void> {
  const key = providerKey(provider);

  const existing = await prisma.oAuthAccount.findUnique({
    where: {
      provider_providerAccountId: { provider: key, providerAccountId: profile.providerAccountId },
    },
    select: { userId: true },
  });

  if (existing && existing.userId !== userId) {
    throw new OAuthError("Tämä tili on jo liitetty toiseen Pekoni-tunnukseen.", 409);
  }

  await prisma.oAuthAccount.upsert({
    where: { userId_provider: { userId, provider: key } },
    create: {
      userId,
      provider: key,
      providerAccountId: profile.providerAccountId,
      ...snapshot(profile),
    },
    update: { ...snapshot(profile), lastLoginAt: new Date() },
  });

  // A player who signed up with a provider has no portrait until now.
  if (profile.avatarUrl) {
    await prisma.user
      .updateMany({
        where: { id: userId, avatarUrl: null },
        data: { avatarUrl: profile.avatarUrl },
      })
      .catch(() => undefined);
  }
}

/** Signs in with a provider profile, creating or adopting an account as needed. */
export async function signInWithProfile(
  provider: OAuthProvider,
  profile: OAuthProfile,
): Promise<SignInOutcome> {
  const key = providerKey(provider);

  // 1. Known link — the ordinary case after the first time.
  const linked = await prisma.oAuthAccount.findUnique({
    where: {
      provider_providerAccountId: { provider: key, providerAccountId: profile.providerAccountId },
    },
    select: { id: true, userId: true, user: { select: { status: true } } },
  });

  if (linked) {
    if (linked.user.status === "SUSPENDED") {
      throw new OAuthError("Tilisi on jäädytetty.", 403);
    }
    await prisma.oAuthAccount.update({
      where: { id: linked.id },
      data: { ...snapshot(profile), lastLoginAt: new Date() },
    });
    return { userId: linked.userId, created: false };
  }

  // 2. A new player.
  //
  //    Deliberately no "adopt the account with the same e-mail" branch. Even a
  //    provider-verified address only proves the provider believes this person
  //    reads that mailbox — it says nothing about who created the Pekoni
  //    account that happens to list it. Linking on that basis would let anyone
  //    who can get a provider to verify an address take over the matching
  //    account. Linking stays an explicit, authenticated act.
  const username = await deriveUsername(profile.usernameSeed);
  const email =
    profile.email && profile.emailVerified && !(await emailTaken(profile.email))
      ? profile.email
      : null;

  const user = await createUser({
    username,
    password: null,
    email,
    minecraftUsername: null,
    avatarUrl: profile.avatarUrl,
  });

  await prisma.oAuthAccount.create({
    data: {
      userId: user.id,
      provider: key,
      providerAccountId: profile.providerAccountId,
      ...snapshot(profile),
    },
  });

  // Since accounts are never merged automatically, a shared e-mail means the
  // player probably already has an account and picked the wrong button. Say so
  // in their notifications rather than letting them wonder where their coins
  // went — and point at the fix, which is linking from settings.
  if (profile.email && profile.emailVerified && email === null) {
    await prisma.notification.create({
      data: {
        userId: user.id,
        kind: "WARNING",
        title: "Onko sinulla jo toinen tili?",
        body:
          "Sähköpostiosoitteesi on jo toisella Pekoni-tilillä. Tämä on uusi, tyhjä tili. " +
          "Jos halusit vanhan tilisi, kirjaudu siihen ja liitä tämä palvelu asetuksista.",
        href: "/settings#connections",
      },
    });
  }

  return { userId: user.id, created: true };
}

async function emailTaken(email: string): Promise<boolean> {
  const row = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  return row !== null;
}

/**
 * Removes a link.
 *
 * Guarded so a player cannot lock themselves out: the last remaining way to
 * sign in is never removable. An account with a password can drop every
 * provider; an account without one must keep at least one.
 */
export async function unlinkProvider(userId: string, provider: OAuthProvider): Promise<void> {
  const key = providerKey(provider);

  const [user, links] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } }),
    prisma.oAuthAccount.findMany({ where: { userId }, select: { provider: true } }),
  ]);

  if (!links.some((link) => link.provider === key)) {
    throw new OAuthError("Tätä tiliä ei ole liitetty.", 404);
  }

  if (!user.passwordHash && links.length <= 1) {
    throw new OAuthError(
      "Tämä on ainoa tapasi kirjautua. Liitä toinen palvelu ensin.",
      409,
    );
  }

  await prisma.oAuthAccount.delete({ where: { userId_provider: { userId, provider: key } } });
}
