import type { Metadata } from "next";
import PekoniScene from "@/components/env/PekoniScene";
import Atmosphere from "@/components/env/Atmosphere";
import { Eyebrow } from "@/components/ui/primitives";
import LeaderboardView from "@/components/leaderboard/LeaderboardView";

export const metadata: Metadata = {
  title: "Leaderboard | Pekoni",
  description:
    "Hall of Legends — Pekonin rikkaimmat, suurimmat voitot, eniten panostaneet ja case battlejen mestarit.",
};

export default function LeaderboardPage() {
  return (
    <div className="relative isolate">
      <div className="env">
        <PekoniScene scene="hall" variant="legends" className="h-full w-full" intensity={0.95} />
        <Atmosphere scene="hall" density={0.7} />
        <div className="env-fog" />
        <div className="grain" />
        <div
          className="absolute inset-x-0 bottom-0 h-2/3"
          style={{ background: "linear-gradient(to bottom, transparent, var(--color-obsidian-950) 78%)" }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <section className="rise max-w-2xl">
          <Eyebrow>Hall of Legends</Eyebrow>
          <h1 className="font-serif-display mt-3 text-[clamp(2.4rem,7vw,4.2rem)] leading-[0.94] tracking-[-0.03em]">
            Leaderboard
          </h1>
          <p className="text-pretty mt-4 text-[15px] leading-relaxed text-[var(--text-dim)]">
            Pekonin saliin on kaiverrettu ne, jotka ovat kulkeneet pisimmälle.
          </p>
        </section>

        <LeaderboardView />
      </div>
    </div>
  );
}
