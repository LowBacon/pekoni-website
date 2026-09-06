import type { Metadata } from "next";
import GameShell from "@/components/game/GameShell";
import LastHopeGame from "@/components/game/LastHopeGame";
import { gameMeta } from "@/lib/games/config";

export const metadata: Metadata = {
  title: "Last Hope | MineBet",
  description:
    "Viisi vaihetta myrskyn läpi kohti muinaista artefaktia. Jatka tai ota voitto — valinta on sinun.",
};

export default function LastHopePage() {
  const meta = gameMeta("lasthope")!;

  return (
    <GameShell
      scene="shrine"
      eyebrow="Pekoni Games"
      title="Last Hope"
      tagline="Hylätty vuoripyhäkkö myrskyn keskellä. Jokainen selvitetty vaihe vie syvemmälle kohti hehkuvaa artefaktia — ja kauemmas turvasta."
      sceneIntensity={0.7}
    >
      <LastHopeGame min={meta.minBet} max={meta.maxBet} />
    </GameShell>
  );
}
