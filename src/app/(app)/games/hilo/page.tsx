import type { Metadata } from "next";
import GameShell from "@/components/game/GameShell";
import ArcadeGame from "@/components/game/ArcadeGame";
import { gameMeta } from "@/lib/games/config";
import { ARCADE_RULES } from "@/lib/games/arcade";

export const metadata: Metadata = {
  title: "Hi-Lo | MineBet",
  description: ARCADE_RULES.hilo,
};

export default function HiLoPage() {
  const meta = gameMeta("hilo")!;

  return (
    <GameShell
      scene="library"
      eyebrow="MineBet Arcade"
      title="Hi-Lo"
      tagline="Korkeampi vai matalampi. Tasapeli häviää, ja todennäköisyys näkyy ennen valintaa."
    >
      <ArcadeGame game="hilo" min={meta.minBet} max={meta.maxBet} />
    </GameShell>
  );
}
