import type { Metadata } from "next";
import AuthForm from "@/components/auth/AuthForm";
import OAuthPanel from "@/components/auth/OAuthPanel";
import { IS_STATIC } from "@/lib/static/config";
import { Eyebrow, Pill } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "Luo tili | MineBet",
  description:
    "Luo MineBet-tili. Uudet pelaajat saavat 1 000 Pekoni Coinsia — suljetun kierron pelivaluuttaa.",
  robots: { index: false, follow: false },
};


/**
 * Providers this deployment has keys for.
 *
 * The static export has no server to run the flow, so it always answers "none"
 * and the block disappears — the same shape the server build takes when neither
 * client id is configured.
 */
async function providers() {
  if (IS_STATIC) return [];
  const { availableProviders } = await import("@/server/oauth");
  return availableProviders();
}

export default async function RegisterPage() {
  const available = await providers();

  return (
    <div className="glass panel-lit rise w-full max-w-[420px] p-7 sm:p-9">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Eyebrow>Uusi pelaaja</Eyebrow>
          <h1 className="font-serif-display mt-3 text-3xl leading-tight">Luo tili</h1>
        </div>
        <Pill tone="emerald" className="mt-1 shrink-0">
          +1 000 coins
        </Pill>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
        Aloitat 1 000 coinsilla. Ne ovat pelivaluuttaa, eivät rahaa.
      </p>
      <div className="mt-7 space-y-4">
        <OAuthPanel
          providers={available}
          mode="register"
          showSetupHint={process.env.NODE_ENV !== "production"}
        />
        <AuthForm mode="register" />
      </div>
    </div>
  );
}
