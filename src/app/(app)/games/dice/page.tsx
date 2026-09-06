import type { Metadata } from "next";
import GameShell from "@/components/game/GameShell";
import DiceGame from "@/components/game/DiceGame";
import { gameMeta } from "@/lib/games/config";

export const metadata: Metadata = {
  title: "Dice | MineBet",
  description:
    "Aseta raja ja heitä. Dice on Pekonin todennäköisyyden alttari — 99 % palautus jokaisella kertoimella.",
};

export default function DicePage() {
  const meta = gameMeta("dice")!;

  return (
    <GameShell
      scene="altar"
      eyebrow="MineBet Originals"
      title="Dice"
      tagline="Muinainen todennäköisyyden alttari kaiverrettiin kauan ennen Pekonin ensimmäisiä kyliä. Aseta rajasi ja anna kiven puhua."
    >
      <DiceGame min={meta.minBet} max={meta.maxBet} />
    </GameShell>
  );
}
