import type { Metadata } from "next";
import GameShell from "@/components/game/GameShell";
import CrashGame from "@/components/game/CrashGame";
import { gameMeta } from "@/lib/games/config";

export const metadata: Metadata = {
  title: "Crash | MineBet",
  description:
    "Nouse vuorelle ja lunasta ennen kuin polku katkeaa. Crash on MineBetin kineettisin peli.",
};

export default function CrashPage() {
  const meta = gameMeta("crash")!;

  return (
    <GameShell
      scene="mountain"
      eyebrow="MineBet Originals"
      title="Crash"
      tagline="Sumu väistyy sitä mukaa kun nouset. Mitä korkeammalle pääset, sitä kauemmas näet — ja sitä pidempi on matka alas."
    >
      <CrashGame min={meta.minBet} max={meta.maxBet} />
    </GameShell>
  );
}
