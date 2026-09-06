import type { Metadata } from "next";
import GameShell from "@/components/game/GameShell";
import ArcadeGame from "@/components/game/ArcadeGame";
import { gameMeta } from "@/lib/games/config";
import { ARCADE_RULES } from "@/lib/games/arcade";

export const metadata: Metadata = {
  title: "Coinflip | MineBet",
  description: ARCADE_RULES.coinflip,
};

export default function CoinflipPage() {
  const meta = gameMeta("coinflip")!;

  return (
    <GameShell
      scene="altar"
      eyebrow="MineBet Arcade"
      title="Coinflip"
      tagline="Yksi heitto ratkaisee. Kaksi vaihtoehtoa, sama todennäköisyys, ei piilotettuja sääntöjä."
    >
      <ArcadeGame game="coinflip" min={meta.minBet} max={meta.maxBet} />
    </GameShell>
  );
}
