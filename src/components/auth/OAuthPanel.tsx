"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import BrandIcon from "@/components/ui/BrandIcon";
import { Icon } from "@/components/ui/Icons";
import { apiUrl } from "@/lib/client/api";
import { OAUTH_PRESENTATION, type OAuthProvider } from "@/lib/oauth";

/**
 * The "continue with…" block above the username and password fields.
 *
 * These are plain links, not fetches: the browser has to leave for Google or
 * Discord and come back, and an anchor is the only thing that survives that
 * round trip cleanly. Which is also why failures arrive as a query parameter —
 * there is no promise left to reject by the time we hear about them.
 */

/** Provider text is never rendered; only these codes reach the page. */
const MESSAGES: Record<string, string> = {
  denied: "Kirjautuminen peruttiin.",
  state: "Istunto vanheni matkalla. Yritä uudelleen.",
  failed: "Tunnistautuminen epäonnistui. Yritä hetken kuluttua uudelleen.",
  taken: "Tämä tili on jo liitetty toiseen Pekoni-tunnukseen.",
  suspended: "Tilisi on jäädytetty. Ota yhteyttä ylläpitoon.",
  session: "Istuntosi päättyi. Kirjaudu sisään ja yritä uudelleen.",
  rate: "Liian monta yritystä. Hetki hengähdystä.",
  unavailable: "Tämä kirjautumistapa ei ole käytössä.",
  // Configuration, not something the player can retry their way out of.
  mismatch:
    "Kirjautuminen palasi väärään osoitteeseen. Palveluntarjoajalle rekisteröity " +
    "redirect URI on väärä — ylläpito löytää oikean osoitteen READMEsta.",
};

export default function OAuthPanel({
  providers,
  mode,
  showSetupHint = false,
}: {
  providers: OAuthProvider[];
  mode: "login" | "register";
  /*
    Development only.

    With no client id and secret a provider button would be a button that cannot
    work, so none is rendered — and the absence is silent, which looks identical
    to the feature having never been built. This note closes that gap for
    whoever runs the site locally. It is never shown in production: telling
    visitors which integrations are unconfigured is an operational detail they
    cannot act on.
  */
  showSetupHint?: boolean;
}) {
  if (providers.length === 0) {
    if (!showSetupHint) return null;
    return (
      <div className="rounded-[var(--radius-control)] border border-dashed border-[var(--line-strong)] px-3.5 py-3">
        <p className="text-[12px] font-semibold text-[var(--text-dim)]">
          Google- ja Discord-kirjautuminen on toteutettu mutta ei määritetty
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-faint)]">
          Aseta <code className="font-mono">GOOGLE_CLIENT_ID</code> /{" "}
          <code className="font-mono">GOOGLE_CLIENT_SECRET</code> ja{" "}
          <code className="font-mono">DISCORD_CLIENT_ID</code> /{" "}
          <code className="font-mono">DISCORD_CLIENT_SECRET</code> .env-tiedostoon ja käynnistä
          uudelleen. Ohjeet ovat READMEssä. Tämä huomautus näkyy vain kehitystilassa.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Suspense fallback={null}>
        <OAuthError />
      </Suspense>

      <div className="grid gap-2">
        {providers.map((provider) => (
          <ProviderButton key={provider} provider={provider} mode={mode} />
        ))}
      </div>

      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-[var(--line-soft)]" />
        <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-faint)]">
          tai
        </span>
        <span className="h-px flex-1 bg-[var(--line-soft)]" />
      </div>
    </div>
  );
}

function ProviderButton({
  provider,
  mode,
}: {
  provider: OAuthProvider;
  mode: "login" | "register";
}) {
  const [leaving, setLeaving] = useState(false);
  const { label, accent } = OAUTH_PRESENTATION[provider];

  return (
    <a
      href={apiUrl(`/api/auth/oauth/${provider}/start`)}
      onClick={() => setLeaving(true)}
      aria-disabled={leaving}
      className="btn btn-ghost w-full justify-center gap-2.5"
      style={{ borderColor: leaving ? accent : undefined }}
    >
      <BrandIcon provider={provider} size={18} />
      <span>
        {leaving
          ? "Siirrytään…"
          : mode === "register"
            ? `Jatka ${label}-tunnuksella`
            : `Kirjaudu ${label}-tunnuksella`}
      </span>
    </a>
  );
}

function OAuthError() {
  const code = useSearchParams().get("oauth_error");
  if (!code) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-[var(--radius-control)] border border-[color-mix(in_oklab,var(--color-danger-500)_30%,transparent)] bg-[color-mix(in_oklab,var(--color-danger-500)_8%,transparent)] px-3.5 py-3"
    >
      <Icon name="warning" size={16} className="mt-0.5 shrink-0 text-[var(--color-danger-400)]" />
      <p className="text-[13px] leading-snug text-[var(--color-danger-400)]">
        {MESSAGES[code] ?? MESSAGES.failed}
      </p>
    </div>
  );
}
