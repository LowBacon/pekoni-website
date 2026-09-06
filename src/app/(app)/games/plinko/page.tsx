import type { Metadata } from "next";
import GameShell from "@/components/game/GameShell";
import ArcadeGame from "@/components/game/ArcadeGame";
import { gameMeta } from "@/lib/games/config";
import { ARCADE_RULES } from "@/lib/games/arcade";

export const metadata: Metadata = {
  title: "Plinko | MineBet",
  description: ARCADE_RULES.plinko,
};

export default function PlinkoPage() {
  const meta = gameMeta("plinko")!;

  return (
    <GameShell
      scene="mine"
      eyebrow="MineBet Arcade"
      title="Plinko"
      tagline="Kahdeksan itsenäistä kolikonheittoa. Korien todennäköisyydet ovat binomijakauma — ja ne näytetään."
    >
      <ArcadeGame game="plinko" min={meta.minBet} max={meta.maxBet} />
    </GameShell>
  );
}
