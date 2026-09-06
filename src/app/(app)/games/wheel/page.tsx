import type { Metadata } from "next";
import GameShell from "@/components/game/GameShell";
import ArcadeGame from "@/components/game/ArcadeGame";
import { gameMeta } from "@/lib/games/config";
import { ARCADE_RULES } from "@/lib/games/arcade";

export const metadata: Metadata = {
  title: "Wheel | MineBet",
  description: ARCADE_RULES.wheel,
};

export default function WheelPage() {
  const meta = gameMeta("wheel")!;

  return (
    <GameShell
      scene="arena"
      eyebrow="MineBet Arcade"
      title="Wheel"
      tagline="Kahdeksan yhtä todennäköistä lohkoa. Osoitin pysähtyy täsmälleen yhteen."
    >
      <ArcadeGame game="wheel" min={meta.minBet} max={meta.maxBet} />
    </GameShell>
  );
}
