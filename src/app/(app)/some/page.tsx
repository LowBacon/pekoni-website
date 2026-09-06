import type { Metadata } from "next";
import Link from "next/link";
import PekoniScene from "@/components/env/PekoniScene";
import Atmosphere from "@/components/env/Atmosphere";
import { Icon } from "@/components/ui/Icons";
import { Eyebrow, Pill, SectionHeader, VirtualCurrencyNote } from "@/components/ui/primitives";
import ActivityFeed from "@/components/home/ActivityFeed";
import ServerStatusCard from "@/components/home/ServerStatusCard";

export const metadata: Metadata = {
  title: "Community | Pekoni",
  description:
    "Pekoni Community — ansaitse coineja yhteisöstä. Tulevat Discord-, TikTok- ja YouTube-integraatiot sekä yhteisön tapahtumat.",
};

/**
 * Pekoni Community.
 *
 * Every integration on this page is genuinely unbuilt, so every one of them is
 * labelled `Tulossa pian` and none of them is clickable. A reward that cannot be
 * earned must never look like one that can.
 */
const CHANNELS = [
  {
    name: "Discord",
    icon: "users",
    accent: "var(--color-violet-400)",
    body: "Yhteisön oma palvelin: pelikaverit, tapahtumailmoitukset ja tuki. Liitos Pekoni-tiliin tuo coineja aktiivisuudesta.",
  },
  {
    name: "TikTok",
    icon: "spark",
    accent: "var(--color-danger-400)",
    body: "Lyhyet klipit Pekonin maailmasta. Julkaisujen katsominen ja jakaminen palkitaan, kun integraatio aukeaa.",
  },
  {
    name: "YouTube",
    icon: "play",
    accent: "var(--color-amber-400)",
    body: "Pidemmät videot, sarjat ja tapahtumatallenteet. Uuden videon katsominen avaa yhteisötehtävän.",
  },
  {
    name: "Yhteisötapahtumat",
    icon: "banner",
    accent: "var(--color-emerald-400)",
    body: "Rakennuskilpailut, turnaukset ja kausiluontoiset eventit Pekoni-palvelimella.",
  },
] as const;

const FUTURE_TASKS = [
  { label: "Katso uusi video", reward: 150, icon: "play" },
  { label: "Osallistu Pekoni-eventtiin", reward: 750, icon: "banner" },
  { label: "Äänestä Pekonia", reward: 250, icon: "star" },
  { label: "Seuraa julkaisua", reward: 100, icon: "heart" },
] as const;

export default function CommunityPage() {
  return (
    <div className="relative isolate">
      <div className="env">
        <PekoniScene scene="lodge" variant="community" className="h-full w-full" intensity={0.85} />
        <Atmosphere scene="lodge" density={0.6} />
        <div className="env-fog" />
        <div className="grain" />
        <div
          className="absolute inset-x-0 bottom-0 h-2/3"
          style={{ background: "linear-gradient(to bottom, transparent, var(--color-obsidian-950) 80%)" }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <section className="rise max-w-2xl">
          <Eyebrow>Pekoni Community</Eyebrow>
          <h1 className="font-serif-display mt-3 text-[clamp(2.4rem,7vw,4rem)] leading-[0.95] tracking-[-0.03em]">
            Social Rewards
          </h1>
          <p className="text-pretty mt-4 text-[15px] leading-relaxed text-[var(--text-dim)] sm:text-base">
            Ansaitse coineja yhteisöstä.
          </p>
          <p className="text-pretty mt-3 max-w-xl text-sm leading-relaxed text-[var(--text-muted)]">
            Yhteisöpalkinnot rakennetaan parhaillaan. Alla näkyy, mitä on tulossa — mikään näistä ei
            ole vielä käytössä, eikä yhtäkään tehtävää voi vielä suorittaa.
          </p>
        </section>

        <section className="mt-11">
          <SectionHeader
            eyebrow="Kanavat"
            title="Mistä Pekoni löytyy"
            description="Integraatiot avataan yksi kerrallaan. Kun kanava on valmis, sen kortti muuttuu toimivaksi tehtäväksi."
          />

          <div className="stagger mt-6 grid gap-4 sm:grid-cols-2">
            {CHANNELS.map((channel) => (
              <div key={channel.name} className="panel relative overflow-hidden p-6" aria-disabled="true">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <span
                      className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl"
                      style={{ color: channel.accent, background: `${channel.accent}14` }}
                    >
                      <Icon name={channel.icon} size={19} />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-[15px] font-semibold">{channel.name}</h3>
                      <p className="text-pretty mt-1.5 text-[13px] leading-relaxed text-[var(--text-muted)]">
                        {channel.body}
                      </p>
                    </div>
                  </div>
                  <Pill>Tulossa pian</Pill>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12 grid gap-5 lg:grid-cols-[1.1fr_1fr]">
          <div className="panel p-6">
            <SectionHeader
              eyebrow="Tehtävät"
              title="Tulevat yhteisötehtävät"
              description="Esimerkkejä siitä, miltä palkinnot näyttävät kun kanavat aukeavat."
            />
            <ul className="mt-6 space-y-2.5">
              {FUTURE_TASKS.map((task) => (
                <li
                  key={task.label}
                  className="flex items-center gap-3.5 rounded-[var(--radius-card)] border border-dashed border-[var(--line)] px-4 py-3.5"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-obsidian-800)] text-[var(--text-faint)]">
                    <Icon name={task.icon} size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-[var(--text-dim)]">
                      {task.label}
                    </p>
                    <p className="tabular mt-0.5 text-[11px] text-[var(--text-faint)]">
                      +{task.reward.toLocaleString("fi-FI")} coins
                    </p>
                  </div>
                  <span className="shrink-0">
                    <Pill>Tulossa pian</Pill>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-xs leading-relaxed text-[var(--text-faint)]">
              Tehtävät eivät ole vielä suoritettavissa. Coineja voi tällä hetkellä ansaita
              pelaamalla, päivittäisestä casesta ja tasonnousuista.
            </p>
          </div>

          <div className="space-y-4">
            <div className="panel relative overflow-hidden p-6">
              <div className="absolute inset-0 opacity-30">
                <PekoniScene
                  scene="hall"
                  variant="community-feed"
                  className="h-full w-full"
                  vignette={false}
                />
              </div>
              <div className="relative">
                <SectionHeader eyebrow="Yhteisö" title="Mitä juuri nyt tapahtuu" />
                <ActivityFeed className="mt-5" limit={6} />
              </div>
            </div>

            <ServerStatusCard compact />

            <div className="panel p-6">
              <Eyebrow>Pekoni Coins</Eyebrow>
              <p className="text-pretty mt-2.5 text-sm leading-relaxed text-[var(--text-muted)]">
                Yhteisöpalkinnot maksetaan samoina virtuaalisina coineina kuin pelivoitot.
              </p>
              <div className="rule my-4" />
              <VirtualCurrencyNote />
              <Link
                href="/games-hub"
                className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--color-emerald-400)]"
              >
                Ansaitse coineja pelaamalla
                <Icon name="arrowRight" size={14} />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
