"use client";

import { useEffect, useState } from "react";
import { IS_STATIC } from "@/lib/static/config";
import { installStaticBackend } from "@/lib/static/backend";
import { Icon } from "@/components/ui/Icons";

// Installed at module evaluation — before React renders anything — so the very
// first `/api/*` call of the session already has somewhere to land. It is a
// no-op on the server and in the full (non-static) build.
installStaticBackend();

const DISMISS_KEY = "pekoni.demo.notice";

/**
 * The demo disclosure for the GitHub Pages build.
 *
 * That build has no server, so accounts, balances and the leaderboard live in
 * this browser only. Saying so plainly matters more than a tidy header: the
 * player should never mistake local storage for a real account.
 */
export default function StaticBackend() {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!IS_STATIC) return;
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (!IS_STATIC || dismissed) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[80] flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+76px)] sm:pb-4">
      <div className="panel-raised flex max-w-2xl items-start gap-3 px-4 py-3 shadow-[var(--shadow-lift)]">
        <Icon name="info" size={16} className="mt-0.5 shrink-0 text-[var(--color-cyan-400)]" />
        <p className="text-[12px] leading-relaxed text-[var(--text-muted)]">
          <span className="font-semibold text-[var(--text-dim)]">Demotila.</span> Tämä on Pekonin
          staattinen versio: tili, saldo ja tilastot tallentuvat vain tähän selaimeen eivätkä näy
          muille. Palvelinversiossa kaikki coinit ja pelitulokset ratkaistaan palvelimella.
        </p>
        <button
          type="button"
          onClick={() => {
            setDismissed(true);
            try {
              window.localStorage.setItem(DISMISS_KEY, "1");
            } catch {
              /* nothing to remember */
            }
          }}
          className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-[var(--text-faint)] transition-colors hover:text-[var(--text-dim)]"
          aria-label="Sulje ilmoitus"
        >
          <Icon name="close" size={14} />
        </button>
      </div>
    </div>
  );
}
