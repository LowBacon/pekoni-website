import type { Metadata } from "next";
import GameShell from "@/components/game/GameShell";
import ArcadeGame from "@/components/game/ArcadeGame";
import { gameMeta } from "@/lib/games/config";
import { ARCADE_RULES } from "@/lib/games/arcade";

export const metadata: Metadata = {
  title: "Tower | MineBet",
  description: ARCADE_RULES.tower,
};

export default function TowerPage() {
  const meta = gameMeta("tower")!;

  return (
    <GameShell
      scene="mine"
      eyebrow="MineBet Arcade"
      title="Tower"
      tagline="Jokaisella kerroksella on tasan yksi ansa, lukittuna ennen ensimmäistä valintaasi."
    >
      <ArcadeGame game="tower" min={meta.minBet} max={meta.maxBet} />
    </GameShell>
  );
}
