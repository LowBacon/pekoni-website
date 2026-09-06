import { requireUser } from "@/server/auth";
import { handleError, LIMITS, ok, requireRate } from "@/server/api";
import {
  getLeaderboard,
  leaderboardValueLabel,
  type LeaderboardRange,
  type LeaderboardTab,
} from "@/server/queries";

export const dynamic = "force-dynamic";

const TABS: LeaderboardTab[] = [
  "richest",
  "biggest-wins",
  "most-wagered",
  "games-played",
  "battles",
];

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    requireRate(`leaderboard:${user.id}`, LIMITS.read);

    const params = new URL(request.url).searchParams;
    const requestedTab = params.get("tab") as LeaderboardTab | null;
    const tab: LeaderboardTab = requestedTab && TABS.includes(requestedTab) ? requestedTab : "richest";
    const range: LeaderboardRange = params.get("range") === "weekly" ? "weekly" : "all-time";

    const rows = await getLeaderboard(tab, range, 50);
    const me = rows.find((row) => row.userId === user.id) ?? null;

    return ok(
      { tab, range, label: leaderboardValueLabel(tab), rows, me, viewerId: user.id },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleError(error);
  }
}
