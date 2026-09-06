# Pekoni

A cinematic Minecraft-inspired community and gaming platform. **MineBet** is
Pekoni's own minigame, case and competitive-arena layer, played entirely with
virtual **Pekoni Coins**.

> Pekoni Coins are virtual. They cannot be bought, withdrawn or exchanged for
> real money, and nothing in the product accepts payment.

## Two ways to run it

Pekoni builds in two shapes from one source tree.

| | `npm run build` | `npm run build:static` |
| --- | --- | --- |
| Host | Any Node host (Vercel, Fly, a VPS) | GitHub Pages, or any static host |
| Data | PostgreSQL / SQLite via Prisma | The visitor's own browser (`localStorage`) |
| Accounts | Real sessions, shared between devices | Local to one browser, not shared |
| Game results | Decided server-side, provably fair | Decided in the browser with `crypto.getRandomValues` |
| Economy integrity | Enforced — atomic ledger, replay guards, role checks | Demonstrated only |

**The server build is the product.** Coins, rolls and permissions are only
trustworthy when a server owns them; GitHub Pages cannot run one, so the static
build is an honest playable demo of the same interface and the same game
mathematics, and it says so on screen.

### Server build (full product)

```bash
cp .env.example .env      # then edit DATABASE_URL and PEKONI_SECRET
npm install
npm run setup             # prisma generate + db push + seed
npm run dev
```

Register the first account at `/register`. Set `PEKONI_OWNER_USERNAME` in `.env`
beforehand to have that account promoted to `OWNER`.

### Static build (GitHub Pages)

```bash
npm run build:static      # writes ./out
npx serve out             # local check
```

For a project site served from `https://<user>.github.io/<repo>/`, pass the base
path:

```bash
NEXT_PUBLIC_BASE_PATH=/<repo> npm run build:static
```

Pushing to `main` publishes automatically via
[`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) once
Pages is set to **Build and deployment → Source → GitHub Actions** in the
repository settings. The workflow fills in the base path for you.

What the static build changes:

- `src/app/api` is moved aside during the build — route handlers cannot be
  exported.
- `src/lib/static/backend.ts` wraps `window.fetch` and answers the same
  `/api/*` paths from `localStorage`, using the same game modules under
  `src/lib/games` so odds and payouts are identical.
- The Minecraft server status is still real: the browser queries the public
  status API directly. No player count is ever invented.
- A demo banner tells the visitor their account lives in that browser only.

## What is here

- **Games** — Slots, Dice, Crash, Mines, Mob Grinder, Last Hope. Each has its
  own place in the world and its own payout maths in `src/lib/games`.
- **Cases** — eight crates plus a free Daily Case. Every case's filler weight is
  *solved* so its expected value lands exactly on 95 % of its price; drop
  chances are published on the case card.
- **Case Battles** — Classic, Team and Crazy modes. Every seat's items are drawn
  when the lobby fills and released on a shared clock, so nobody can read ahead.
- **Progression** — XP, levels, rank titles and 17 achievements.
- **Leaderboard, profile, community, admin** — including an append-only audit
  log and role checks that live on the server, never in the UI.

## Sign in with Google and Discord

Both providers are optional and independent: one whose client id *and* secret
are set gets a button, the others simply do not appear. The flow is implemented
directly (PKCE + signed state cookie) rather than through an auth library,
because the session table, cookie and role model already exist here.

| Variable | Where to get it |
| --- | --- |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | [Google Cloud console](https://console.cloud.google.com/apis/credentials) → OAuth client (Web application) |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | [Discord developer portal](https://discord.com/developers/applications) → your app → OAuth2 |
| `PEKONI_PUBLIC_URL` | Your public origin, no trailing slash. Required behind a proxy or tunnel. |

Register these **exact** redirect URIs with each provider:

```
http://localhost:3000/api/auth/callback/google
http://localhost:3000/api/auth/callback/discord
```

Swap `http://localhost:3000` for your public origin in production, and set
`PEKONI_PUBLIC_URL` to that origin so the value sent to the provider matches
what is registered even behind a proxy.

The app also answers the older `/api/auth/oauth/<provider>/callback` path, so a
console configured that way keeps working — but the URI it *sends* is the one
above, and that is the one that must be registered. A mismatch fails at the
provider with `redirect_uri_mismatch`, which says nothing about which side is
wrong.

**Scopes are the minimum that sign-in needs**: `openid email profile` for Google
(the `openid` is required — the profile comes from the OIDC userinfo endpoint and
identity is keyed on the `sub` claim) and `identify email` for Discord. Guild and
bot scopes are deliberately not requested; nothing here reads a player's servers,
and asking for access the app never uses makes for a worse consent screen and a
larger blast radius if a token leaks.

Both providers use PKCE (S256) alongside a signed, single-use state cookie.

**Accounts are never merged on a matching e-mail address**, not even a
provider-verified one. An address proves the provider believes someone reads
that mailbox; it does not prove they own the Pekoni account that lists it.
Signing in with a second provider therefore creates a *separate* account, and
the new account gets a notification explaining how to reach the old one. To put
both providers on one account, sign in with the first and link the second from
**Settings → Connections**, where you are already authenticated.

## Minecraft plugin integration

Account linking and coin transfers need a plugin on the Minecraft server. Until
`PEKONI_PLUGIN_SECRET` is set, both features are switched **off** and the UI says
so — nothing is simulated and no transfer is ever shown as delivered when it is
not.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Put that value in `.env` as `PEKONI_PLUGIN_SECRET` and in the plugin config.

### Request signing

Every plugin request carries three headers:

| Header | Value |
| --- | --- |
| `X-Pekoni-Timestamp` | unix milliseconds |
| `X-Pekoni-Nonce` | random, unique per request |
| `X-Pekoni-Signature` | hex HMAC-SHA256 of the canonical string |

```
canonical = `${timestamp}.${nonce}.${METHOD}.${path}.${sha256hex(body)}`
signature = HMAC-SHA256(PEKONI_PLUGIN_SECRET, canonical)
```

Method and path are signed so a captured signature cannot be replayed at another
endpoint; the body hash covers the payload; the timestamp bounds the replay
window to five minutes and the nonce cache closes it.

`scripts/minecraft-plugin-reference.mjs` implements this in about twenty lines
and is the executable specification — run it against a dev server to exercise
the whole flow before writing the real plugin.

### Endpoints

| Endpoint | Purpose |
| --- | --- |
| `POST /api/plugin/link` | `{code, uuid, username}` — burns a link code and creates the verified link |
| `POST /api/plugin/transfers/claim` | `{limit}` — returns transfers to deliver and marks them CLAIMED |
| `POST /api/plugin/transfers/complete` | `{transferId}` — confirms delivery; **idempotent** |
| `POST /api/plugin/transfers/fail` | `{transferId, reason}` — refunds the player through the ledger |
| `POST /api/plugin/heartbeat` | `{online: [uuid]}` — presence, and refunds transfers that went stale |

### What the plugin must implement

1. `/minebet link <code>` → `POST /api/plugin/link` with the player's UUID and
   name. Show the server's message back to the player.
2. A repeating task (every 5-10s) → `claim`, credit each returned transfer in
   game, then `complete` it. **Credit first, confirm second**: a crash between
   the two leaves the transfer CLAIMED and it is refunded automatically after 30
   minutes, whereas confirming first could lose the coins.
3. A heartbeat every minute or so with the online players' UUIDs.

### Transfer model

Transfers are **one-directional**: website → game server. There is no path back,
and Pekoni Coins are a closed-loop virtual currency with no cash value and no
redemption.

The debit is immediate and atomic; delivery is a separate retryable step. Coins
are always in exactly one place — on the wallet, reserved against a
PENDING/CLAIMED transfer, delivered, or refunded. Limits are 100 minimum,
100 000 per transfer, 250 000 per rolling 24 hours.

## Live Results

The feed carries only real, settled rounds. There is no simulated activity and
no filler when it is quiet — an empty feed renders as empty.

**Publication is transactional.** `publishSettlement` writes the `LiveResult`
row inside the same database transaction that writes the `GameRound`
(`src/server/games/engine.ts`), so a settlement cannot exist without its
published event or vice versa. The invariant is checkable:
`count(GameRound) === count(LiveResult)`.

**Accounting is stated once and never re-derived in the UI:**

| Field | Definition |
| --- | --- |
| Wager | Coins staked |
| Total payout | Coins returned, **including the stake** |
| Net result | `payout − wager` |
| Multiplier | `payout ÷ wager` |
| Outcome | WIN / LOSS / PUSH, from the round |

So a 100-coin wager returning 150 is a **+50 profit**; returning 0 is a **−100
loss**; returning 86 is a **−14 loss**, not a win. Refunded and cancelled rounds
are labelled separately and excluded from the win/loss statistics.

**Statistics** keep players and rounds as separate metrics. "Active players"
means unique players with settled rounds in the selected period — it is *not*
online presence, and the page says so next to the number.

**Transport** is server-sent events (`/api/results/stream`). The stream carries
a durable `sequence` cursor as the SSE event id, so a reconnecting browser sends
`Last-Event-ID` and resumes without gaps or duplicates. The client refetches a
privacy-checked snapshot on each invalidation rather than trusting a pushed
payload, which means a player who turns off public activity disappears from
other people's feeds immediately. Connections are capped per identity and in
total; the client keeps at most 120 rows and pauses when you scroll away.

**Privacy** is enforced in `src/server/results.ts`, not in the interface. With
`publicActivity` off, the API returns `"Hidden player"` and a null avatar to
everyone except the player themselves. There is no loss leaderboard, and the
`mine` view requires a session (401 otherwise).

## Arcade games

Five short-round games share one settlement endpoint (`/api/games/arcade`) and
one rules module (`src/lib/games/arcade.ts`).

| Game | Shape | Notes |
| --- | --- | --- |
| Coinflip | instant | 50 %, returns 1.98× |
| Wheel | instant | eight equally likely segments |
| Plinko | instant | eight independent 50/50 steps; binomial buckets |
| Tower | session | one trap per floor, fixed before the first choice; cash out any time |
| Hi-Lo | session | ties lose, and the payout reflects that |

The rules text and the odds table shown in each game are read from the same
module the server settles with, so the numbers a player reads are the numbers
that were used. Session games hide the trap layout and the RNG cursor from the
client — `publicChoice` in the arcade route is what strips them.

Every wager carries an idempotency key, so a double-click or a retried request
resolves to the same round instead of a second stake.

## Provably fair

The claim is backed by a working mechanism, not just a label:

1. The server commits to a seed by publishing its SHA-256 hash in **Settings**
   before any round is played.
2. Outcomes are `HMAC-SHA256(serverSeed, clientSeed:nonce:cursor)`. You control
   your own client seed.
3. Rotating the seed reveals the old one. **/fair** then recomputes any round
   from it — in your browser, using the same modules in `src/lib/games` that the
   server used, with no network call in the verification path.

Dice, slots and crash verify completely from a single round row. The multi-step
games (mines, last hope, mob grinder) depend on choices made during the round,
so `/fair` verifies their seed commitment and says plainly that it cannot replay
the round.

## Responsible play

Players can set a maximum bet, a rolling 24-hour wager cap, and a break. All
three are enforced in the settlement path (`src/server/limits.ts`), not in the
UI. Tightening a limit is immediate; **loosening one takes 24 hours**, because a
limit that can be lifted the moment it starts to bite is not a limit.

## Admin panel

Role-based, with four ranks: `USER` → `MODERATOR` → `ADMIN` → `OWNER`.

| Action | Minimum rank |
| --- | --- |
| View the console, suspend/restore, reset daily cooldown | MODERATOR |
| Add or remove coins | ADMIN |
| Change someone's role | OWNER |

Authorisation is enforced twice and the two checks answer different questions.
Every `/api/admin/*` route calls `requireRole` — that is the control that
protects the economy, and it holds regardless of what the browser does. The page
itself also checks, so a player who types `/admin` is sent home rather than shown
a console where every panel reads "Ei käyttöoikeutta". Nobody may act on an
account at or above their own rank, and nobody may suspend or re-role themselves.

**Every balance adjustment requires a reason**, is written to the ledger as an
`ADMIN_ADJUSTMENT` transaction, and appears in the audit log. Nothing edits a
balance directly and no historical result is ever rewritten.

### The first administrator

A fresh install has no staff, so the console is unreachable until one exists.
Two ways in:

```bash
# 1. Registration hook — set in .env, then register that exact username.
PEKONI_OWNER_USERNAME="LowBacon"
```

That only fires at password registration and only on an exact match, so it
cannot promote an existing account and does nothing for a Google or Discord
sign-up (those derive a username from the provider profile). For those:

```bash
npx tsx --env-file-if-exists=.env scripts/grant-role.ts --list
npx tsx --env-file-if-exists=.env scripts/grant-role.ts LowBacon OWNER
```

The script is deliberately local rather than an endpoint — anything reachable
over HTTP that can mint an owner is a way in for everyone else too. Its changes
land in the same audit log as the panel, marked `(CLI)`.

### The audit log outlives the accounts

`AdminAuditLog` nulls its user links on delete rather than cascading, and stores
the actor and target usernames at write time. Cascading would mean an
administrator could erase the record of their own actions by closing their
account, which is the one thing an audit trail exists to prevent.

## Database changes

This version adds `OAuthAccount`, `MinecraftAccount`, `MinecraftLinkCode`,
`Transfer` and `PlayLimits`, makes `User.passwordHash` nullable, and adds
`User.avatarUrl` / `User.onboardedAt` plus `Session.lastUsedAt`.

The live system adds `LiveResult` (the published settlement, keyed by an
autoincrementing `sequence` that the feed uses as its cursor), plus
`GameConfig`, `PlatformState`, `PluginNonce` and `RetiredSeed`.

`LiveResult.round` cascades on delete. It has to: `GameRound` cascades from
`User`, so without it a single published round made the account impossible to
delete, and the failure surfaced only as a foreign-key error.

```bash
npx prisma db push        # or: npm run db:migrate
```

The starting 1 000 coins are now written as a `SIGNUP_BONUS` ledger entry rather
than straight onto the wallet, so `sum(transactions) === balance` holds for every
account. Existing accounts predate that entry — backfill them once:

```bash
npx tsx --env-file-if-exists=.env scripts/backfill-opening-balances.ts          # dry run
npx tsx --env-file-if-exists=.env scripts/backfill-opening-balances.ts --apply
```

## Layout

```
src/app          routes: (app) shell, (auth), api handlers
src/components   UI — env scenes, games, cases, battles, nav, primitives
src/lib          pure shared logic: game maths, progression, formatting
src/lib/content  the world's data (cases, achievements) shared by seed + demo
src/lib/static   the browser-local backend used only by the static build
src/server       server-only: auth, wallet, engine, RNG, admin, queries
prisma           schema + seed
```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `start` | Production server build |
| `npm run build:static` | GitHub Pages export into `out/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:seed` | Cases + achievements |
| `npm run setup` | generate + push + seed |
| `node scripts/minecraft-plugin-reference.mjs` | Reference plugin client — link, claim, complete, fail, heartbeat, drain |
| `scripts/backfill-opening-balances.ts` | One-off: ledger entry for pre-existing opening balances |
| `scripts/grant-role.ts` | List accounts, or grant/revoke MODERATOR / ADMIN / OWNER |

## Notes

Pekoni is an independent community project and is not affiliated with Mojang
Studios or Microsoft. All artwork is original vector geometry generated in the
browser; no game assets are reused.
