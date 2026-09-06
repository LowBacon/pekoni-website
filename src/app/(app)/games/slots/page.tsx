import type { Metadata } from "next";
import GameShell from "@/components/game/GameShell";
import SlotsGame from "@/components/game/SlotsGame";
import { gameMeta } from "@/lib/games/config";

export const metadata: Metadata = {
  title: "Slots | MineBet",
  description:
    "Pekonin muinainen louhintakone. Viisi rullaa, yhdeksän voittolinjaa ja riimu joka korvaa kaiken.",
};

export default function SlotsPage() {
  const meta = gameMeta("slots")!;

  return (
    <GameShell
      scene="mine"
      eyebrow="MineBet Originals"
      title="Slots"
      tagline="Syvällä kalliossa jyskyttää kone, jota kukaan ei muista rakentaneensa. Se erottelee malmin kivestä — ja joskus antaa jotain paljon arvokkaampaa."
    >
      <SlotsGame min={meta.minBet} max={meta.maxBet} />
    </GameShell>
  );
}
