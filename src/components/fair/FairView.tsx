"use client";

import { useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icons";
import { Eyebrow, SectionHeader } from "@/components/ui/primitives";
import PekoniScene from "@/components/env/PekoniScene";
import Atmosphere from "@/components/env/Atmosphere";
import { verifyRound, VERIFIABLE_GAMES, type VerifyOutput } from "@/lib/fair/verify";

/**
 * The verification tool.
 *
 * Deliberately a client-side page with no server call anywhere in the
 * verification path. Asking our own server "were you fair?" would prove nothing;
 * the point is that the player recomputes the round themselves, with the same
 * maths the server used, on their own machine. The page says so, and the
 * browser's network tab backs it up.
 */
export default function FairView() {
  const [form, setForm] = useState({
    game: "dice",
    serverSeed: "",
    serverSeedHash: "",
    clientSeed: "",
    nonce: "0",
    bet: "100",
    recorded: "",
  });
  const [result, setResult] = useState<VerifyOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set =
    (key: keyof typeof form) =>
    (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value }));

  const run = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      let recorded: Record<string, unknown> | null = null;
      if (form.recorded.trim()) {
        try {
          recorded = JSON.parse(form.recorded) as Record<string, unknown>;
        } catch {
          throw new Error("Kierroksen tulos ei ole kelvollista JSONia.");
        }
      }
      setResult(
        await verifyRound({
          game: form.game,
          serverSeed: form.serverSeed.trim(),
          serverSeedHash: form.serverSeedHash.trim(),
          clientSeed: form.clientSeed.trim(),
          nonce: Number(form.nonce) || 0,
          bet: Number(form.bet) || 0,
          recorded,
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Tarkistus epäonnistui.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative isolate">
      <div className="env">
        <PekoniScene scene="library" variant="settings" className="h-full w-full" intensity={0.6} />
        <Atmosphere scene="library" density={0.3} />
        <div className="env-fog" />
        <div className="grain" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[880px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <section className="rise">
          <Eyebrow>Provably fair</Eyebrow>
          <h1 className="font-serif-display mt-3 text-[clamp(2.2rem,6vw,3.4rem)] leading-[0.96] tracking-[-0.03em]">
            Tarkista kierros itse
          </h1>
          <p className="text-pretty mt-4 max-w-[62ch] text-[15px] leading-relaxed text-[var(--text-dim)]">
            Emme pyydä sinua uskomaan meitä. Jokainen tulos johdetaan siemenestä, johon sitouduimme{" "}
            <em>ennen</em> kierrosta, ja voit laskea sen uudelleen tällä sivulla. Laskenta tapahtuu
            selaimessasi — tämä sivu ei kysy palvelimeltamme mitään.
          </p>
        </section>

        <section className="panel panel-lit mt-8 p-6">
          <SectionHeader eyebrow="Miten se toimii" title="Kolme vaihetta" />
          <ol className="mt-5 space-y-4">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-3.5">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--color-cyan-500)_18%,transparent)] text-[11px] font-bold text-[var(--color-cyan-300)]">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-[var(--text-dim)]">{step.title}</p>
                  <p className="text-pretty mt-1 text-[13px] leading-relaxed text-[var(--text-muted)]">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <form onSubmit={run} className="panel mt-4 p-6">
          <SectionHeader
            eyebrow="Tarkistin"
            title="Syötä kierroksen tiedot"
            description="Löydät nämä asetuksistasi ja profiilisi kierroshistoriasta."
          />

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field label="Peli" htmlFor="fair-game">
              <select id="fair-game" className="field" value={form.game} onChange={set("game")}>
                {VERIFIABLE_GAMES.map((game) => (
                  <option key={game} value={game}>
                    {game}
                  </option>
                ))}
                <option value="mines">mines — vain sitoumus</option>
                <option value="lasthope">lasthope — vain sitoumus</option>
                <option value="mobgrinder">mobgrinder — vain sitoumus</option>
              </select>
            </Field>

            <Field label="Kierrosnumero (nonce)" htmlFor="fair-nonce">
              <input
                id="fair-nonce"
                className="field"
                inputMode="numeric"
                value={form.nonce}
                onChange={set("nonce")}
              />
            </Field>

            <Field label="Paljastettu palvelimen siemen" htmlFor="fair-seed" wide>
              <input
                id="fair-seed"
                className="field font-mono text-[12px]"
                value={form.serverSeed}
                onChange={set("serverSeed")}
                placeholder="Näkyy vasta kun olet vaihtanut siemenen"
              />
            </Field>

            <Field label="Etukäteen julkaistu tiiviste" htmlFor="fair-hash" wide>
              <input
                id="fair-hash"
                className="field font-mono text-[12px]"
                value={form.serverSeedHash}
                onChange={set("serverSeedHash")}
                placeholder="Asetuksissa näkynyt SHA-256"
              />
            </Field>

            <Field label="Oma siemenesi" htmlFor="fair-client">
              <input
                id="fair-client"
                className="field font-mono text-[12px]"
                value={form.clientSeed}
                onChange={set("clientSeed")}
              />
            </Field>

            <Field label="Panos" htmlFor="fair-bet">
              <input
                id="fair-bet"
                className="field"
                inputMode="numeric"
                value={form.bet}
                onChange={set("bet")}
              />
            </Field>

            <Field label="Kierroksen tallennettu tulos — JSON, valinnainen" htmlFor="fair-recorded" wide>
              <input
                id="fair-recorded"
                className="field font-mono text-[12px]"
                value={form.recorded}
                onChange={set("recorded")}
                placeholder='{"roll":42.13,"target":50,"direction":"under"}'
              />
            </Field>
          </div>

          <button type="submit" className="btn btn-cyan mt-6" disabled={busy || !form.serverSeed}>
            {busy ? "Lasketaan…" : "Tarkista"}
            {!busy && <Icon name="shield" size={15} />}
          </button>

          {error && (
            <p role="alert" className="mt-4 text-[13px] text-[var(--color-danger-400)]">
              {error}
            </p>
          )}

          {result && <Outcome result={result} />}
        </form>
      </div>
    </div>
  );
}

const STEPS = [
  {
    title: "Sitoumus ennen peliä",
    body:
      "Palvelin arpoo siemenen ja julkaisee siitä SHA-256-tiivisteen asetuksissasi. Tiiviste ei " +
      "paljasta siementä, mutta lukitsee sen — sitä ei voi vaihtaa jälkikäteen.",
  },
  {
    title: "Kierros",
    body:
      "Tulos on HMAC-SHA256(palvelimen siemen, oma siemenesi : kierrosnumero : kohdistin). Sinä " +
      "hallitset omaa siementäsi, joten emme voi valita tulosta yksin.",
  },
  {
    title: "Paljastus ja tarkistus",
    body:
      "Kun vaihdat siemenen asetuksista, vanha siemen paljastetaan. Silloin voit tarkistaa täällä, " +
      "että sen tiiviste täsmää ja että kierrokset toistuvat täsmälleen samanlaisina.",
  },
];

function Field({
  label,
  htmlFor,
  wide,
  children,
}: {
  label: string;
  htmlFor: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-[var(--text-dim)]">
        {label}
      </label>
      {children}
    </div>
  );
}

function Outcome({ result }: { result: VerifyOutput }) {
  return (
    <div className="mt-6 space-y-3 border-t border-[var(--line-soft)] pt-6" aria-live="polite">
      <Check
        ok={result.commitmentValid}
        title={result.commitmentValid ? "Sitoumus täsmää" : "Sitoumus EI täsmää"}
        detail={
          result.commitmentValid
            ? "Paljastetun siemenen SHA-256 vastaa etukäteen julkaistua tiivistettä."
            : `Laskettu tiiviste: ${result.computedHash}`
        }
      />

      {result.supported ? (
        <Check
          ok={result.matches !== false}
          title={
            result.matches === null
              ? "Tulos laskettu"
              : result.matches
                ? "Tulos täsmää"
                : "Tulos EI täsmää"
          }
          detail={
            result.matches === null
              ? "Liitä kierroksen tallennettu tulos, niin vertaamme ne puolestasi."
              : result.matches
                ? "Uudelleenlaskettu tulos vastaa tallennettua."
                : "Uudelleenlaskettu tulos poikkeaa tallennetusta."
          }
        />
      ) : (
        <p className="rounded-[var(--radius-control)] border border-[var(--line)] px-4 py-3 text-[13px] leading-relaxed text-[var(--text-muted)]">
          {result.note}
        </p>
      )}

      {result.computed && (
        <div className="min-w-0">
          <p className="eyebrow mb-2">Uudelleenlaskettu tulos</p>
          <pre className="overflow-x-auto rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--color-obsidian-900)] p-3.5 font-mono text-[12px] text-[var(--text-dim)]">
            {JSON.stringify(result.computed, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function Check({ ok, title, detail }: { ok: boolean; title: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 rounded-[var(--radius-control)] border border-[var(--line)] px-4 py-3.5">
      <span
        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full"
        style={{
          background: ok
            ? "color-mix(in oklab, var(--color-emerald-500) 22%, transparent)"
            : "color-mix(in oklab, var(--color-danger-500) 22%, transparent)",
          color: ok ? "var(--color-emerald-300)" : "var(--color-danger-400)",
        }}
      >
        <Icon name={ok ? "check" : "close"} size={12} />
      </span>
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-[var(--text-dim)]">{title}</p>
        <p className="mt-0.5 break-all text-[12px] leading-relaxed text-[var(--text-muted)]">
          {detail}
        </p>
      </div>
    </div>
  );
}
