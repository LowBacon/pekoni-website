/**
 * Grants or revokes a staff role from the command line.
 *
 * There has to be a way in that does not require already being an administrator,
 * or the first one can never exist. `PEKONI_OWNER_USERNAME` covers the fresh
 * install — whoever registers that name becomes OWNER — but it only fires at
 * registration, so it cannot help an account that already exists, and it does
 * nothing for an account created through Google or Discord (those derive their
 * username from the provider profile, which will not match).
 *
 * This closes both gaps. It is deliberately a local script rather than an
 * endpoint: anything reachable over HTTP that can mint an owner is a way in for
 * everybody else too.
 *
 * Every change is written to the same `AdminAuditLog` the panel writes to, so a
 * promotion made here is as visible as one made in the UI. The actor is the
 * target themselves, with the metadata saying it came from the CLI — there is no
 * signed-in administrator to attribute it to, and inventing one would put a
 * false name in the audit trail.
 *
 *   npx tsx --env-file-if-exists=.env scripts/grant-role.ts LowBacon OWNER
 *   npx tsx --env-file-if-exists=.env scripts/grant-role.ts LowBacon USER
 *   npx tsx --env-file-if-exists=.env scripts/grant-role.ts --list
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ROLES = ["USER", "MODERATOR", "ADMIN", "OWNER"] as const;
type Role = (typeof ROLES)[number];

async function list() {
  const users = await prisma.user.findMany({
    select: { username: true, role: true, status: true, createdAt: true },
    orderBy: [{ role: "desc" }, { createdAt: "asc" }],
  });

  if (users.length === 0) {
    console.log("No accounts yet.");
    return;
  }

  console.log("username        role        status");
  console.log("--------------------------------------");
  for (const user of users) {
    console.log(
      `${user.username.padEnd(15)} ${user.role.padEnd(11)} ${user.status}`,
    );
  }

  const staff = users.filter((u) => u.role !== "USER");
  if (staff.length === 0) {
    console.log(
      "\nNo staff accounts. The admin panel is unreachable until at least one\n" +
        "account holds MODERATOR or higher.",
    );
  }
}

async function grant(username: string, role: Role) {
  const user = await prisma.user.findUnique({
    where: { usernameLower: username.toLowerCase() },
    select: { id: true, username: true, role: true },
  });

  if (!user) {
    console.error(`No account named "${username}".`);
    console.error(
      "\nRegister it first at /register — or, if PEKONI_OWNER_USERNAME is set to\n" +
        "that name, registering it makes it OWNER automatically and you will not\n" +
        "need this script at all.",
    );
    process.exit(1);
  }

  if (user.role === role) {
    console.log(`${user.username} is already ${role}. Nothing to do.`);
    return;
  }

  const previous = user.role;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { role } });

    await tx.adminAuditLog.create({
      data: {
        actorId: user.id,
        actorName: user.username,
        targetId: user.id,
        targetName: user.username,
        action: "SET_ROLE",
        summary: `${user.username}: ${previous} -> ${role} (CLI)`,
        metadata: JSON.stringify({
          source: "scripts/grant-role.ts",
          previous: { role: previous },
          next: { role },
          note: "Granted from the command line; no signed-in administrator.",
        }),
      },
    });
  });

  console.log(`${user.username}: ${previous} -> ${role}`);
  if (role !== "USER") {
    console.log("They may need to sign out and back in for the nav to update.");
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--list") {
    await list();
    return;
  }

  const [username, roleArg] = args;
  const role = (roleArg ?? "").toUpperCase() as Role;

  if (!ROLES.includes(role)) {
    console.error(`Usage: grant-role.ts <username> <${ROLES.join("|")}>`);
    console.error("       grant-role.ts --list");
    process.exit(1);
  }

  await grant(username, role);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
