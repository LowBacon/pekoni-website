"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiPost, useResource } from "@/lib/client/api";
import { formatCoins, formatRelative } from "@/lib/format";
import { BATTLE_MODES, BATTLE_MODE_META, type BattleMode } from "@/lib/enums";
import PekoniScene from "@/components/env/PekoniScene";
import Atmosphere from "@/components/env/Atmosphere";
import Avatar from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icons";
import {
  Coins,
  EmptyState,
  ErrorState,
  Eyebrow,
  Pill,
  SectionHeader,
  Skeleton,
  VirtualCurrencyNote,
} from "@/components/ui/primitives";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { caseScene, type CaseSummary } from "@/components/cases/CaseCard";
import BattleRoom from "./BattleRoom";

type LobbyBattle = {
  id: string;
  mode: BattleMode;
  status: string;
  rounds: number;
  slots: number;
  entryCost: number;
  case: { slug: string; name: string; price: number; theme: string };
  createdAt: string;
  participants: {
    slot: number;
    isBot: boolean;
    username: string;
    minecraftUsername: string | null;
  }[];
};

type RecentBattle = {
  id: string;
  mode: string;
  caseName: string;
  theme: string;
  prizePool: number;
  finishedAt: string | null;
  winners: { username: string; minecraftUsername: string | null }[];
};

const SLOT_OPTIONS = [2, 3, 4] as const;
const ROUND_OPTIONS = [1, 2, 3, 4, 5, 6] as const;

export default function BattlesView() {
  const [selected, setSelected] = useState<string | null>(null);
  const { balance, refresh } = usePlayer();
  const { sound } = usePreferences();
  const toast = useToast();

  // The battle id lives in the query string so a room survives a refresh and can
  // be linked to, without needing a server-rendered dynamic route.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) setSelected(id);
  }, []);

  const openRoom = useCallback((id: string | null) => {
    setSelected(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("id", id);
    else url.searchParams.delete("id");
    window.history.replaceState(null, "", url.toString());
    if (!id) window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const lobby = useResource<{ battles: LobbyBattle[]; recent: RecentBattle[] }>("/api/battles", {
    pollMs: 4_000,
    enabled: !selected,
  });
  const catalogue = useResource<{ cases: CaseSummary[] }>("/api/cases");

  const cases = catalogue.data?.cases ?? [];
  const [caseId, setCaseId] = useState<string>("");
  const [mode, setMode] = useState<BattleMode>("CLASSIC");
  const [rounds, setRounds] = useState(3);
  const [slots, setSlots] = useState(2);
  const [bots, setBots] = useState(0);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!caseId && cases.length > 0) setCaseId(cases[0].id);
  }, [cases, caseId]);

  const chosenCase = useMemo(() => cases.find((entry) => entry.id === caseId), [cases, caseId]);
  const entryCost = (chosenCase?.price ?? 0) * rounds;
  const totalCost = entryCost * (1 + bots);

  // Team battles need even seats; bots can never fill the last human seat.
  useEffect(() => {
    if (mode === "TEAM" && slots % 2 !== 0) setSlots(slots === 3 ? 4 : 2);
  }, [mode, slots]);
  useEffect(() => {
    if (bots > slots - 1) setBots(slots - 1);
  }, [bots, slots]);

  const create = async () => {
    if (!chosenCase || creating) return;
    if (totalCost > balance) {
      sound("error");
      toast.error("Coinit eivät riitä.", `Tämä battle maksaisi ${formatCoins(totalCost)} coins.`);
      return;
    }
    if (balance > 0 && totalCost / balance > 0.5) {
      const share = Math.round((totalCost / balance) * 100);
      if (!window.confirm(`Panostat ${share} % saldostasi. Jatketaanko?`)) return;
    }

    setCreating(true);
    try {
      const response = await apiPost<{ battleId: string }>("/api/battles", {
        caseId: chosenCase.id,
        rounds,
        slots,
        mode,
        bots,
      });
      sound("bet");
      toast.success("Battle luotu", `${chosenCase.name} · ${rounds} kierrosta`);
      await refresh();
      openRoom(response.battleId);
    } catch (cause) {
      sound("error");
      toast.error(cause instanceof Error ? cause.message : "Jokin meni pieleen.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="relative isolate">
      <div className="env">
        <PekoniScene scene="arena" variant="battles" className="h-full w-full" intensity={0.95} />
        <Atmosphere scene="arena" density={0.65} />
        <div className="env-fog" />
        <div className="grain" />
        <div
          className="absolute inset-x-0 bottom-0 h-2/3"
          style={{ background: "linear-gradient(to bottom, transparent, var(--color-obsidian-950) 78%)" }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <section className="rise max-w-2xl">
          <Eyebrow>Competitive arena</Eyebrow>
          <h1 className="font-serif-display mt-3 text-[clamp(2.4rem,7vw,4.2rem)] leading-[0.94] tracking-[-0.03em]">
            Case Battles
          </h1>
          <p className="text-pretty mt-4 text-[15px] leading-relaxed text-[var(--text-dim)]">
            Sama arkku, useampi avaaja, yksi voittaja. Kaikki avaukset paljastuvat samaan tahtiin
            jokaisen ruudulla.
          </p>
        </section>

        {selected ? (
          <BattleRoom battleId={selected} onExit={() => openRoom(null)} />
        ) : (
          <>
            {/* ------------------------------------------------------- create */}
            <section className="panel-raised rise mt-8 relative overflow-hidden">
              {chosenCase && (
                <div className="absolute inset-0 opacity-30">
                  <PekoniScene
                    scene={caseScene(chosenCase.theme).scene}
                    variant={`battle-create-${chosenCase.slug}`}
                    className="h-full w-full"
                    vignette={false}
                  />
                </div>
              )}

              <div className="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[1.4fr_1fr]">
                <div>
                  <Eyebrow>Luo battle</Eyebrow>
                  <h2 className="font-serif-display mt-2 text-2xl">Aseta säännöt</h2>

                  <div className="mt-5 space-y-4">
                    <label className="block">
                      <span className="eyebrow mb-2 block">Case</span>
                      <select
                        value={caseId}
                        onChange={(event) => setCaseId(event.target.value)}
                        className="field"
                      >
                        {cases.map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.name} — {formatCoins(entry.price)} coins
                          </option>
                        ))}
                      </select>
                    </label>

                    <div>
                      <span className="eyebrow mb-2 block">Pelimuoto</span>
                      <div className="segment">
                        {BATTLE_MODES.map((option) => (
                          <button
                            key={option}
                            type="button"
                            className="segment-item"
                            data-active={mode === option}
                            onClick={() => {
                              sound("click");
                              setMode(option);
                            }}
                          >
                            {BATTLE_MODE_META[option].label}
                          </button>
                        ))}
                      </div>
                      <p className="mt-2 text-[12px] text-[var(--text-muted)]">
                        {BATTLE_MODE_META[mode].description}
                      </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <span className="eyebrow mb-2 block">Kierroksia</span>
                        <div className="flex flex-wrap gap-1.5">
                          {ROUND_OPTIONS.map((option) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => setRounds(option)}
                              aria-pressed={rounds === option}
                              className={`tabular min-h-[38px] min-w-[38px] rounded-[10px] border text-[13px] font-semibold transition-colors ${
                                rounds === option
                                  ? "border-[color-mix(in_oklab,var(--color-emerald-500)_45%,transparent)] bg-[color-mix(in_oklab,var(--color-emerald-500)_13%,transparent)] text-[var(--color-emerald-300)]"
                                  : "border-[var(--line)] text-[var(--text-muted)] hover:border-[var(--line-strong)]"
                              }`}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <span className="eyebrow mb-2 block">Pelaajia</span>
                        <div className="flex flex-wrap gap-1.5">
                          {SLOT_OPTIONS.filter((option) => mode !== "TEAM" || option % 2 === 0).map(
                            (option) => (
                              <button
                                key={option}
                                type="button"
                                onClick={() => setSlots(option)}
                                aria-pressed={slots === option}
                                className={`tabular min-h-[38px] min-w-[38px] rounded-[10px] border text-[13px] font-semibold transition-colors ${
                                  slots === option
                                    ? "border-[color-mix(in_oklab,var(--color-violet-500)_45%,transparent)] bg-[color-mix(in_oklab,var(--color-violet-500)_13%,transparent)] text-[var(--color-violet-400)]"
                                    : "border-[var(--line)] text-[var(--text-muted)] hover:border-[var(--line-strong)]"
                                }`}
                              >
                                {option}
                              </button>
                            ),
                          )}
                        </div>
                      </div>
                    </div>

                    <div>
                      <span className="eyebrow mb-2 block">Botteja</span>
                      <div className="flex flex-wrap gap-1.5">
                        {Array.from({ length: slots }).map((_, option) => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => setBots(option)}
                            aria-pressed={bots === option}
                            className={`tabular min-h-[38px] min-w-[38px] rounded-[10px] border text-[13px] font-semibold transition-colors ${
                              bots === option
                                ? "border-[color-mix(in_oklab,var(--color-cyan-500)_45%,transparent)] bg-[color-mix(in_oklab,var(--color-cyan-500)_13%,transparent)] text-[var(--color-cyan-400)]"
                                : "border-[var(--line)] text-[var(--text-muted)] hover:border-[var(--line-strong)]"
                            }`}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                      <p className="mt-2 text-[12px] text-[var(--text-muted)]">
                        Maksat myös bottien paikat. Battle alkaa heti kun kaikki paikat ovat täynnä.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col justify-between gap-5 rounded-[var(--radius-card)] border border-[var(--line-soft)] bg-[color-mix(in_oklab,var(--color-obsidian-900)_74%,transparent)] p-5">
                  <div>
                    <Eyebrow>Yhteenveto</Eyebrow>
                    <dl className="mt-4 space-y-2.5 text-[13px]">
                      <Row label="Case" value={chosenCase?.name ?? "—"} />
                      <Row label="Paikan hinta" value={`${formatCoins(entryCost)} coins`} />
                      <Row label="Maksat" value={`${1 + bots} paikkaa`} />
                      <div className="rule my-3" />
                      <div className="flex items-baseline justify-between">
                        <dt className="text-[var(--text-muted)]">Yhteensä</dt>
                        <dd>
                          <Coins amount={totalCost} size="lg" />
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div>
                    <button
                      type="button"
                      onClick={create}
                      disabled={creating || !chosenCase}
                      className="btn btn-primary w-full"
                    >
                      {creating ? "Luodaan…" : "Luo battle"}
                      {!creating && <Icon name="arrowRight" size={15} className="btn-nudge" />}
                    </button>
                    <p className="mt-3 text-[11px] leading-relaxed text-[var(--text-faint)]">
                      Talo ei ota battlesta osuutta — koko potti menee voittajalle.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* -------------------------------------------------------- lobby */}
            <section className="mt-12">
              <SectionHeader
                eyebrow="Aula"
                title="Avoimet battlet"
                description="Liity odottavaan battleen tai seuraa käynnissä olevaa."
              />

              {lobby.error && !lobby.data ? (
                <ErrorState className="mt-6" onRetry={lobby.reload} />
              ) : lobby.loading && !lobby.data ? (
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-[132px] rounded-[var(--radius-card)]" />
                  ))}
                </div>
              ) : (lobby.data?.battles.length ?? 0) === 0 ? (
                <EmptyState
                  className="mt-6"
                  icon="battles"
                  title="Avoimia battleja ei löytynyt."
                  description="Luo oma battle yllä — voit täyttää vapaat paikat boteilla ja aloittaa heti."
                />
              ) : (
                <div className="stagger mt-6 grid gap-3 sm:grid-cols-2">
                  {lobby.data?.battles.map((battle) => (
                    <button
                      key={battle.id}
                      type="button"
                      onClick={() => {
                        sound("click");
                        openRoom(battle.id);
                      }}
                      className="tile group relative overflow-hidden p-4 text-left"
                      style={{ ["--tile-glow" as string]: caseScene(battle.case.theme).glow }}
                    >
                      <div className="tile-art absolute inset-0 opacity-45">
                        <PekoniScene
                          scene={caseScene(battle.case.theme).scene}
                          variant={`lobby-${battle.id}`}
                          className="h-full w-full"
                        />
                      </div>
                      <div
                        className="absolute inset-0"
                        style={{
                          background:
                            "linear-gradient(to right, var(--color-obsidian-950) 20%, color-mix(in oklab, var(--color-obsidian-950) 60%, transparent) 70%)",
                        }}
                      />
                      <div className="relative">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Pill
                                tone={
                                  battle.mode === "CRAZY"
                                    ? "danger"
                                    : battle.mode === "TEAM"
                                      ? "cyan"
                                      : "emerald"
                                }
                              >
                                {BATTLE_MODE_META[battle.mode]?.label ?? battle.mode}
                              </Pill>
                              <Pill>{battle.rounds}×</Pill>
                              {battle.status === "RUNNING" && (
                                <Pill tone="amber">Käynnissä</Pill>
                              )}
                            </div>
                            <h3 className="mt-2 truncate text-[15px] font-semibold">
                              {battle.case.name}
                            </h3>
                            <p className="mt-0.5 text-[11px] text-[var(--text-faint)]">
                              {formatRelative(battle.createdAt)}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <Coins amount={battle.entryCost} size="sm" />
                            <p className="mt-0.5 text-[11px] text-[var(--text-faint)]">/ paikka</p>
                          </div>
                        </div>

                        <div className="mt-3.5 flex items-center justify-between gap-3">
                          <div className="flex -space-x-2">
                            {Array.from({ length: battle.slots }).map((_, slot) => {
                              const participant = battle.participants.find(
                                (entry) => entry.slot === slot,
                              );
                              return participant ? (
                                <span
                                  key={slot}
                                  className="rounded-[6px] ring-2 ring-[var(--color-obsidian-950)]"
                                >
                                  <Avatar
                                    username={participant.username}
                                    minecraftUsername={participant.minecraftUsername}
                                    size={28}
                                  />
                                </span>
                              ) : (
                                <span
                                  key={slot}
                                  className="flex size-7 items-center justify-center rounded-[6px] border border-dashed border-[var(--line)] bg-[var(--color-obsidian-900)] ring-2 ring-[var(--color-obsidian-950)]"
                                >
                                  <Icon name="plus" size={11} className="text-[var(--text-faint)]" />
                                </span>
                              );
                            })}
                          </div>
                          <span className="tile-cta inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--color-emerald-400)]">
                            {battle.status === "RUNNING" ? "Seuraa" : "Liity"}
                            <Icon name="arrowRight" size={14} className="btn-nudge" />
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* ------------------------------------------------------ results */}
            <section className="mt-12 grid gap-5 lg:grid-cols-[1.15fr_1fr]">
              <div className="panel p-6">
                <SectionHeader eyebrow="Ratkenneet" title="Viimeisimmät voitot" />
                {(lobby.data?.recent.length ?? 0) === 0 ? (
                  <p className="mt-5 text-sm text-[var(--text-muted)]">
                    Yhtään battlea ei ole vielä ratkennut.
                  </p>
                ) : (
                  <ul className="mt-5 space-y-1">
                    {lobby.data?.recent.map((battle) => (
                      <li key={battle.id} className="flex items-center gap-3 rounded-[10px] px-2 py-2">
                        {battle.winners[0] && (
                          <Avatar
                            username={battle.winners[0].username}
                            minecraftUsername={battle.winners[0].minecraftUsername}
                            size={30}
                            ring
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] text-[var(--text-muted)]">
                            <span className="font-semibold text-[var(--text-dim)]">
                              {battle.winners.map((winner) => winner.username).join(" & ") || "—"}
                            </span>{" "}
                            voitti {battle.caseName}
                          </p>
                          <p className="text-[11px] text-[var(--text-faint)]">
                            {battle.finishedAt ? formatRelative(battle.finishedAt) : ""}
                          </p>
                        </div>
                        <Coins amount={battle.prizePool} size="sm" showMark={false} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="panel p-6">
                <Eyebrow>Miten battle ratkeaa</Eyebrow>
                <h3 className="font-serif-display mt-2.5 text-xl">Sama kello kaikille</h3>
                <p className="text-pretty mt-2.5 text-sm leading-relaxed text-[var(--text-muted)]">
                  Kaikkien osallistujien esineet arvotaan palvelimella kun viimeinen paikka täyttyy.
                  Kierrokset julkaistaan yhteisen kellon mukaan, joten kukaan ei näe tulosta
                  etukäteen — ei myöskään battlen luoja.
                </p>
                <div className="rule my-5" />
                <VirtualCurrencyNote />
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="truncate font-semibold text-[var(--text-dim)]">{value}</dd>
    </div>
  );
}
