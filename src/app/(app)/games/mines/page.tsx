import type { Metadata } from "next";
import GameShell from "@/components/game/GameShell";
import MinesGame from "@/components/game/MinesGame";
import { gameMeta } from "@/lib/games/config";

export const metadata: Metadata = {
  title: "Mines | MineBet",
  description:
    "Kristallikaivos odottaa. Kaiva turvallisia ruutuja, kasvata kerrointa ja lunasta ennen miinaa.",
};

export default function MinesPage() {
  const meta = gameMeta("mines")!;

  return (
    <GameShell
      scene="cavern"
      eyebrow="MineBet Originals"
      title="Mines"
      tagline="Smaragdiluola hehkuu himmeästi kiven takaa. Jokainen kaivettu ruutu vie syvemmälle — ja lähemmäs sitä, mitä kannattaisi jättää rauhaan."
    >
      <MinesGame min={meta.minBet} max={meta.maxBet} />
    </GameShell>
  );
}
