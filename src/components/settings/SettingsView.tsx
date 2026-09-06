"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPatch, apiPost, useResource } from "@/lib/client/api";
import { USERNAME_HINT } from "@/lib/validation";
import PekoniScene from "@/components/env/PekoniScene";
import Atmosphere from "@/components/env/Atmosphere";
import Avatar from "@/components/ui/Avatar";
import ConnectionsSection from "./ConnectionsSection";
import SecuritySection from "./SecuritySection";
import { Icon } from "@/components/ui/Icons";
import {
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

type Settings = {
  soundEnabled: boolean;
  reducedMotion: boolean;
  publicActivity: boolean;
  minecraftUsername: string | null;
  clientSeed: string;
  serverSeedHash: string;
  nonce: number;
  hasPassword: boolean;
};

export default function SettingsView() {
  const { data, error, loading, reload, setData } = useResource<{ settings: Settings }>(
    "/api/me/settings",
  );
  const { player, refresh } = usePlayer();
  const { soundEnabled, setSoundEnabled, reducedMotion, setReducedMotion, volume, changeVolume, sound } =
    usePreferences();
  const toast = useToast();

  const [minecraft, setMinecraft] = useState("");
  const [clientSeed, setClientSeed] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  // Signing out is a fetch rather than a form post, so it works the same in the
  // static export where there is no endpoint to post a form to.
  const logout = async () => {
    try {
      await apiPost("/api/auth/logout");
    } finally {
      router.push("/");
      router.refresh();
    }
  };

  useEffect(() => {
    if (!data) return;
    setMinecraft(data.settings.minecraftUsername ?? "");
    setClientSeed(data.settings.clientSeed);
  }, [data]);

  const patch = async (body: Record<string, unknown>, message?: string) => {
    setSaving(true);
    try {
      const response = await apiPatch<{ settings: Settings; revealedSeed: string | null }>(
        "/api/settings",
        body,
      );
      setData({ settings: response.settings });
      if (response.revealedSeed) setRevealed(response.revealedSeed);
      if (message) toast.success(message);
      await refresh();
    } catch (cause) {
      sound("error");
      toast.error(cause instanceof Error ? cause.message : "Jokin meni pieleen.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative isolate">
      <div className="env">
        <PekoniScene scene="library" variant="settings" className="h-full w-full" intensity={0.75} />
        <Atmosphere scene="library" density={0.4} />
        <div className="env-fog" />
        <div className="grain" />
        <div
          className="absolute inset-x-0 bottom-0 h-2/3"
          style={{ background: "linear-gradient(to bottom, transparent, var(--color-obsidian-950) 80%)" }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[880px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <section className="rise">
          <Eyebrow>Asetukset</Eyebrow>
          <h1 className="font-serif-display mt-3 text-[clamp(2.2rem,6vw,3.4rem)] leading-[0.96] tracking-[-0.03em]">
            Hahmo ja asetukset
          </h1>
          <p className="text-pretty mt-4 text-[15px] leading-relaxed text-[var(--text-dim)]">
            Ääni, liike, Minecraft-identiteetti ja kierrosten todennettavuus.
          </p>
        </section>

        {error && !data ? (
          <ErrorState className="mt-8" onRetry={reload} />
        ) : loading || !data ? (
          <div className="mt-8 space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-40 rounded-[var(--radius-panel)]" />
            ))}
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            {/* ------------------------------------------------------ identity */}
            <section className="panel p-6" id="identity">
              <SectionHeader
                eyebrow="Identiteetti"
                title="Minecraft-nimi"
                description="Nimi hakee hahmosi pään avatariksi kautta koko Pekonin. Voit poistaa sen milloin tahansa."
              />

              <div className="mt-6 flex flex-wrap items-center gap-5">
                <Avatar
                  username={player?.username ?? ""}
                  minecraftUsername={minecraft || null}
                  avatarUrl={player?.avatarUrl ?? null}
                  size={64}
                  ring
                />
                <div className="min-w-[220px] flex-1">
                  <label className="eyebrow mb-2 block" htmlFor="mc-name">
                    Minecraft-käyttäjänimi
                  </label>
                  <input
                    id="mc-name"
                    className="field"
                    value={minecraft}
                    onChange={(event) => setMinecraft(event.target.value)}
                    placeholder="Esim. Pekoni"
                    maxLength={16}
                    autoComplete="off"
                  />
                  <p className="mt-2 text-[11px] text-[var(--text-faint)]">{USERNAME_HINT}</p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => patch({ minecraftUsername: minecraft.trim() }, "Minecraft-nimi tallennettu")}
                  className="btn btn-primary btn-sm"
                >
                  Tallenna nimi
                </button>
                {data.settings.minecraftUsername && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      setMinecraft("");
                      void patch({ minecraftUsername: null }, "Minecraft-nimi poistettu");
                    }}
                    className="btn btn-ghost btn-sm"
                  >
                    Poista
                  </button>
                )}
              </div>
            </section>

            {/* ---------------------------------------------------- experience */}
            <section className="panel p-6">
              <SectionHeader
                eyebrow="Kokemus"
                title="Ääni ja liike"
                description="Asetukset tallentuvat tilillesi ja seuraavat mukana laitteesta toiseen."
              />

              <div className="mt-6 space-y-1">
                <Toggle
                  label="Äänet"
                  detail="Peliäänet, voitot ja case-avaukset."
                  checked={soundEnabled}
                  onChange={(value) => {
                    setSoundEnabled(value);
                    void patch({ soundEnabled: value });
                  }}
                />
                <div className="flex items-center gap-4 px-1 py-3">
                  <label className="w-40 shrink-0 text-[14px] text-[var(--text-muted)]" htmlFor="volume">
                    Äänenvoimakkuus
                  </label>
                  <input
                    id="volume"
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(volume * 100)}
                    onChange={(event) => changeVolume(Number(event.target.value) / 100)}
                    className="flex-1 accent-[var(--color-emerald-500)]"
                    disabled={!soundEnabled}
                  />
                  <span className="tabular w-10 text-right text-[13px] text-[var(--text-dim)]">
                    {Math.round(volume * 100)}
                  </span>
                </div>
                <Toggle
                  label="Vähennetty liike"
                  detail="Poistaa parallaksin, hiukkaset ja pitkät siirtymät."
                  checked={reducedMotion}
                  onChange={(value) => {
                    setReducedMotion(value);
                    void patch({ reducedMotion: value });
                  }}
                />
                <Toggle
                  label="Näy yhteisösyötteessä"
                  detail="Voittosi ja saavutuksesi voivat näkyä julkisessa syötteessä. Saldo ja tapahtumat eivät koskaan."
                  checked={data.settings.publicActivity}
                  onChange={(value) => patch({ publicActivity: value }, "Asetus tallennettu")}
                />
              </div>
            </section>

            {/* --------------------------------------------------- connections */}
            <ConnectionsSection />

            <SecuritySection hasPassword={data.settings.hasPassword} />

            {/* ------------------------------------------------------ fairness */}
            <section className="panel p-6" id="fairness">
              <SectionHeader
                eyebrow="Provably fair"
                title="Kierrosten todennettavuus"
                description="Jokainen tulos johdetaan palvelimen siemenestä, sinun siemenestäsi ja kierroksen järjestysnumerosta. Tiiviste julkaistaan etukäteen."
              />

              <dl className="mt-6 space-y-3">
                <div>
                  <dt className="eyebrow mb-1.5">Palvelimen siemenen tiiviste</dt>
                  <dd className="break-all rounded-[10px] border border-[var(--line-soft)] bg-[var(--color-obsidian-900)] px-3 py-2 font-mono text-[12px] text-[var(--text-dim)]">
                    {data.settings.serverSeedHash}
                  </dd>
                </div>

                <div>
                  <label className="eyebrow mb-1.5 block" htmlFor="client-seed">
                    Oma siemenesi
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <input
                      id="client-seed"
                      className="field flex-1"
                      value={clientSeed}
                      onChange={(event) => setClientSeed(event.target.value)}
                      maxLength={64}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => patch({ clientSeed: clientSeed.trim() }, "Siemen tallennettu")}
                      className="btn btn-ghost"
                    >
                      Tallenna
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div>
                    <p className="text-[13px] font-semibold text-[var(--text-dim)]">
                      Kierroksia tällä siemenellä
                    </p>
                    <p className="tabular mt-0.5 text-[12px] text-[var(--text-faint)]">
                      {data.settings.nonce}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      if (!window.confirm("Vaihdetaan siemen? Vanha siemen paljastetaan sinulle.")) return;
                      void patch({ rotateServerSeed: true }, "Siemen vaihdettu");
                    }}
                    className="btn btn-ghost btn-sm"
                  >
                    <Icon name="refresh" size={14} />
                    Vaihda palvelimen siemen
                  </button>
                </div>
              </dl>

              {revealed && (
                <div className="mt-5 rounded-[10px] border border-[color-mix(in_oklab,var(--color-emerald-500)_26%,transparent)] bg-[color-mix(in_oklab,var(--color-emerald-500)_6%,transparent)] p-4">
                  <div className="flex items-center gap-2">
                    <Pill tone="emerald">Paljastettu</Pill>
                    <p className="text-[12px] text-[var(--text-muted)]">
                      Vanha palvelimen siemen — sillä voit tarkistaa kaikki aiemmat kierroksesi.
                    </p>
                  </div>
                  <p className="mt-2.5 break-all font-mono text-[12px] text-[var(--text-dim)]">
                    {revealed}
                  </p>
                </div>
              )}
            </section>

            <section className="panel p-6">
              <Eyebrow>Tili</Eyebrow>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-[14px] font-semibold">{player?.username}</p>
                  <p className="mt-0.5 text-[12px] text-[var(--text-faint)]">
                    Rooli: {player?.role ?? "USER"}
                  </p>
                </div>
                <button type="button" onClick={logout} className="btn btn-ghost btn-sm">
                  <Icon name="logout" size={14} />
                  Kirjaudu ulos
                </button>
              </div>
              <div className="rule my-5" />
              <VirtualCurrencyNote />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function Toggle({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-4 rounded-[10px] px-1 py-3 transition-colors hover:bg-[color-mix(in_oklab,var(--color-frost-100)_3%,transparent)]">
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold text-[var(--text-dim)]">{label}</span>
        <span className="text-pretty mt-0.5 block text-[12px] leading-relaxed text-[var(--text-muted)]">
          {detail}
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors"
        style={{
          background: checked
            ? "color-mix(in oklab, var(--color-emerald-500) 55%, transparent)"
            : "var(--color-obsidian-700)",
        }}
      >
        <span
          className="absolute top-0.5 size-5 rounded-full bg-[var(--color-frost-100)] transition-[left] duration-200 ease-[var(--ease-out-soft)]"
          style={{ left: checked ? 22 : 2 }}
        />
      </button>
    </label>
  );
}
