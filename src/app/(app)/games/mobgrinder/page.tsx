import type { Metadata } from "next";
import GameShell from "@/components/game/GameShell";
import MobGrinderGame from "@/components/game/MobGrinderGame";
import { gameMeta } from "@/lib/games/config";

export const metadata: Metadata = {
  title: "Mob Grinder | Pekoni",
  description:
    "Taitopeli Pekonin metsän uumenissa. Kaada mobeja, kasvata comboa ja lunasta potti ennen kuin raunio hiljenee.",
};

export default function MobGrinderPage() {
  const meta = gameMeta("mobgrinder")!;

  return (
    <GameShell
      scene="ruins"
      eyebrow="Pekoni Games"
      title="Mob Grinder"
      tagline="Sammaloitunut kivimylly nukkuu syvällä pohjoisessa kuusikossa. Kun se herää, raunioon virtaa asukkaita — ja vain nopeat kädet saavat niistä palkkion."
    >
      <MobGrinderGame min={meta.minBet} max={meta.maxBet} />
    </GameShell>
  );
}
