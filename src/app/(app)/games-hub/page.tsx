import type { Metadata } from "next";
import PekoniScene from "@/components/env/PekoniScene";
import Atmosphere from "@/components/env/Atmosphere";
import { Eyebrow } from "@/components/ui/primitives";
import GameLibraryPanel from "@/components/hub/GameLibraryPanel";

export const metadata: Metadata = {
  title: "Games | Pekoni",
  description:
    "Valitse maailma ja aloita pelaaminen. Pekonin pelikirjasto — MineBet Originals, arcade-pelit, moninpeli ja caset.",
};

export default function GamesHubPage() {
  return (
    <div className="relative isolate">
      <div className="env">
        <PekoniScene scene="clearing" variant="library" className="h-full w-full" intensity={0.8} />
        <Atmosphere scene="clearing" density={0.55} />
        <div className="env-fog" />
        <div className="grain" />
        <div
          className="absolute inset-x-0 bottom-0 h-2/3"
          style={{ background: "linear-gradient(to bottom, transparent, var(--color-obsidian-950) 78%)" }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <section className="rise max-w-2xl">
          <Eyebrow>Pekonin pelikirjasto</Eyebrow>
          <h1 className="font-serif-display mt-3 text-[clamp(2.6rem,8vw,4.4rem)] leading-[0.92] tracking-[-0.03em]">
            Pelit
          </h1>
          <p className="text-pretty mt-4 text-[15px] leading-relaxed text-[var(--text-dim)] sm:text-base">
            Valitse maailma ja aloita pelaaminen.
          </p>
        </section>

        <GameLibraryPanel />
      </div>
    </div>
  );
}
