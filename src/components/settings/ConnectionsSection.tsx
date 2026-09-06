"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, apiUrl, useResource } from "@/lib/client/api";
import { IS_STATIC } from "@/lib/static/config";
import { OAUTH_PRESENTATION, type OAuthProvider } from "@/lib/oauth";
import BrandIcon from "@/components/ui/BrandIcon";
import { Icon } from "@/components/ui/Icons";
import { Pill, SectionHeader, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/providers/ToastProvider";

/**
 * Linked Google and Discord accounts.
 *
 * Linking leaves the site, so this section is half fetch and half redirect: the
 * list comes from the API, the "link" action is an anchor, and the answer comes
 * back as a query parameter on the way in. Unlinking is an ordinary request and
 * can therefore fail loudly — which it does when it would be the last remaining
 * way into the account.
 */

type Linked = {
  provider: OAuthProvider;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  linkedAt: string;
};

type Payload = {
  linked: Linked[];
  available: OAuthProvider[];
  hasPassword: boolean;
};

export default function ConnectionsSection() {
  // No server in the static export means no flow to run and nothing to link.
  if (IS_STATIC) return null;
  return (
    <Suspense fallback={null}>
      <Connections />
    </Suspense>
  );
}

function Connections() {
  const { data, error, loading, setData } = useResource<Payload>("/api/me/connections");
  const [busy, setBusy] = useState<OAuthProvider | null>(null);
  const toast = useToast();

  useOAuthResultToast();

  if (error && !data) return null;

  if (loading || !data) {
    return (
      <section className="panel p-6">
        <Skeleton className="h-32 rounded-[var(--radius-panel)]" />
      </section>
    );
  }

  if (data.available.length === 0) return null;

  const linkedBy = new Map(data.linked.map((row) => [row.provider, row]));
  // Removing the last route in would lock the account out; the server refuses
  // it too, but the button should not invite the attempt.
  const removable = data.hasPassword || data.linked.length > 1;

  const unlink = async (provider: OAuthProvider) => {
    const { label } = OAUTH_PRESENTATION[provider];
    if (!window.confirm(`Poistetaanko ${label}-liitos?`)) return;

    setBusy(provider);
    try {
      const response = await apiFetch<{ linked: Linked[] }>("/api/me/connections", {
        method: "DELETE",
        body: JSON.stringify({ provider }),
      });
      setData((current) => (current ? { ...current, linked: response.linked } : current));
      toast.success(`${label}-liitos poistettu`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Jokin meni pieleen.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="panel p-6" id="connections">
      <SectionHeader
        eyebrow="Yhteydet"
        title="Liitetyt tilit"
        description="Liitä Google tai Discord, niin voit kirjautua yhdellä napautuksella. Emme koskaan julkaise mitään puolestasi."
      />

      <ul className="mt-6 space-y-2">
        {data.available.map((provider) => {
          const link = linkedBy.get(provider);
          const { label } = OAUTH_PRESENTATION[provider];

          return (
            <li
              key={provider}
              className="mb-lift flex flex-wrap items-center gap-4 rounded-[10px] border border-[var(--line-soft)] px-4 py-3.5"
            >
              <BrandIcon provider={provider} size={22} className="shrink-0" />

              <div className="min-w-[140px] flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[14px] font-semibold text-[var(--text-dim)]">{label}</p>
                  {link && <Pill tone="emerald">Liitetty</Pill>}
                </div>
                <p className="mt-0.5 truncate text-[12px] text-[var(--text-faint)]">
                  {link
                    ? (link.displayName ?? link.email ?? "Liitetty tili")
                    : `Kirjaudu jatkossa ${label}-tunnuksella.`}
                </p>
              </div>

              {link ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={!removable || busy === provider}
                  title={
                    removable
                      ? undefined
                      : "Tämä on ainoa tapasi kirjautua. Liitä toinen palvelu ensin."
                  }
                  onClick={() => void unlink(provider)}
                >
                  <Icon name="close" size={14} />
                  {busy === provider ? "Poistetaan…" : "Poista liitos"}
                </button>
              ) : (
                <a
                  className="btn btn-ghost btn-sm"
                  href={apiUrl(
                    `/api/auth/oauth/${provider}/start?mode=link&next=%2Fsettings%23connections`,
                  )}
                >
                  <Icon name="plus" size={14} />
                  Liitä
                </a>
              )}
            </li>
          );
        })}
      </ul>

      {!removable && data.linked.length > 0 && (
        <p className="mt-4 text-[12px] leading-relaxed text-[var(--text-faint)]">
          Tilisi kirjautuu tällä hetkellä vain liitetyllä palvelulla, joten viimeistä liitosta ei
          voi poistaa.
        </p>
      )}
    </section>
  );
}

/** Turns the callback's query parameter into a toast, then tidies the URL. */
function useOAuthResultToast() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();

  const linked = params.get("linked");
  const failure = params.get("oauth_error");

  useEffect(() => {
    if (!linked && !failure) return;

    if (linked && linked in OAUTH_PRESENTATION) {
      const { label } = OAUTH_PRESENTATION[linked as OAuthProvider];
      toast.success(`${label} liitetty`, "Voit nyt kirjautua sillä sisään.");
    } else if (failure) {
      toast.error(
        failure === "taken"
          ? "Tämä tili on jo liitetty toiseen Pekoni-tunnukseen."
          : failure === "denied"
            ? "Liittäminen peruttiin."
            : "Liittäminen epäonnistui. Yritä uudelleen.",
      );
    }

    // A refresh should not replay the toast, and the parameter has served its
    // purpose the moment it has been read.
    router.replace("/settings#connections");
  }, [linked, failure, router, toast]);
}
