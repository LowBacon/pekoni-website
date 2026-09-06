import type { Metadata } from "next";
import Link from "next/link";
import { GAME_CATALOG } from "@/lib/games/config";
import PekoniScene from "@/components/env/PekoniScene";
import Atmosphere from "@/components/env/Atmosphere";
import { Icon } from "@/components/ui/Icons";
import { Eyebrow, Pill, SectionHeader, VirtualCurrencyNote } from "@/components/ui/primitives";
import GameTile from "@/components/hub/GameTile";
import ActivityFeed from "@/components/home/ActivityFeed";

export const metadata: Metadata = {
  title: "MineBet | Pekoni",
  description:
    "Valitse peli ja aloita kierros. MineBet Originals, Pekoni-pelit ja caset yhdessä paikassa — kaikki virtuaalisilla Pekoni Coinseilla.",
};

/**
 * The MineBet floor. `/casino` stays as the route so old links keep working,
 * but nothing on the page calls itself a casino — this is Pekoni's own arcade.
 */
const SECTIONS = [
  {
    id: "originals",
    eyebrow: "MineBet Originals",
    title: "Talon omat",
    description:
      "Neljä peliä, jotka Pekoni rakensi itse. Jokainen kierros johdetaan palvelimen siemenestä ja on jälkikäteen tarkistettavissa.",
    keys: ["dice", "crash", "mines", "slots"],
  },
  {
    id: "pekoni",
    eyebrow: "Pekoni Games",
    title: "Maailman pelit",
    description:
      "Taitopohjaisempia kokemuksia metsän raunioissa ja vuoren pyhäköissä. Enemmän peliä kuin panostusta.",
    keys: ["mobgrinder", "lasthope"],
  },
  {
    id: "cases",
    eyebrow: "Cases",
    title: "Holvi ja areena",
    description:
      "Tutkimusmatkailijan arkut, päivittäinen huoltolaatikko ja moninpelin case battlet.",
    keys: ["cases", "battles"],
  },
] as const;

export default function MineBetFloor() {
  return (
    <div className="relative isolate">
      <div className="env">
        <PekoniScene scene="cavern" variant="floor" className="h-full w-full" intensity={0.85} />
        <Atmosphere scene="cavern" density={0.6} />
        <div className="env-fog" />
        <div className="grain" />
        <div
          className="absolute inset-x-0 bottom-0 h-3/4"
          style={{ background: "linear-gradient(to bottom, transparent, var(--color-obsidian-950) 80%)" }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <section className="rise max-w-2xl">
          <Eyebrow>Pekoni World</Eyebrow>
          <h1 className="font-serif-display mt-3 text-[clamp(2.6rem,8vw,4.6rem)] leading-[0.92] tracking-[-0.03em]">
            MineBet
          </h1>
          <p className="text-pretty mt-4 text-[15px] leading-relaxed text-[var(--text-dim)] sm:text-base">
            Valitse peli ja aloita kierros.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Pill tone="emerald">Virtuaalivaluutta</Pill>
            <Pill tone="cyan">Todennettavasti reilu</Pill>
            <Pill tone="amber">1 % talon marginaali</Pill>
          </div>
        </section>

        {SECTIONS.map((section) => {
          const games = section.keys
            .map((key) => GAME_CATALOG.find((game) => game.key === key))
            .filter((game): game is NonNullable<typeof game> => Boolean(game));

          return (
            <section key={section.id} className="mt-12" id={section.id}>
              <SectionHeader
                eyebrow={section.eyebrow}
                title={section.title}
                description={section.description}
              />
              <div className="stagger mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {games.map((game) => (
                  <GameTile key={game.key} game={game} />
                ))}
                {section.id === "cases" && (
                  <Link
                    href="/daily-case"
                    className="tile group relative flex min-h-[228px] flex-col justify-end overflow-hidden p-5"
                    style={{ ["--tile-glow" as string]: "var(--color-amber-500)" }}
                  >
                    <div className="tile-art absolute inset-0">
                      <PekoniScene scene="clearing" variant="daily-tile" className="h-full w-full" />
                    </div>
                    <div
                      className="absolute inset-0"
                      style={{
                        background:
                          "linear-gradient(to top, var(--color-obsidian-950) 6%, color-mix(in oklab, var(--color-obsidian-950) 60%, transparent) 44%, transparent 76%)",
                      }}
                    />
                    <div className="relative">
                      <div className="mb-2">
                        <Pill tone="amber">Ilmainen</Pill>
                      </div>
                      <h3 className="text-lg font-semibold tracking-[-0.015em]">Daily Case</h3>
                      <p className="text-pretty mt-1 text-[13px] leading-snug text-[var(--text-muted)]">
                        Metsäaukion huoltoarkku. Kerran vuorokaudessa, ilman panosta.
                      </p>
                      <span className="tile-cta mt-3.5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--color-amber-400)]">
                        Avaa
                        <Icon name="arrowRight" size={14} />
                      </span>
                    </div>
                  </Link>
                )}
              </div>
            </section>
          );
        })}

        <section className="mt-12 grid gap-5 lg:grid-cols-[1.15fr_1fr]">
          <div className="panel p-6">
            <SectionHeader eyebrow="Live" title="Kierroksia juuri nyt" />
            <ActivityFeed className="mt-5" limit={8} />
          </div>
          <div className="panel relative overflow-hidden p-6">
            <div className="absolute inset-0 opacity-25">
              <PekoniScene scene="library" variant="rules" className="h-full w-full" vignette={false} />
            </div>
            <div className="relative">
              <Eyebrow>Pelaa harkiten</Eyebrow>
              <h3 className="font-serif-display mt-2.5 text-xl">Coinit ovat pelivälineitä</h3>
              <p className="text-pretty mt-2.5 text-sm leading-relaxed text-[var(--text-muted)]">
                MineBet sisältää kasinotyylisiä mekaniikkoja, mutta pelimerkit ovat pelkkää peliä.
                Coineja ansaitaan pelaamalla ja yhteisössä — niitä ei voi ostaa oikealla rahalla.
              </p>
              <div className="rule my-5" />
              <VirtualCurrencyNote />
              <Link
                href="/settings#fairness"
                className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--color-emerald-400)]"
              >
                Tarkista kierrosten reiluus
                <Icon name="arrowRight" size={14} />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
