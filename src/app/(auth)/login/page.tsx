import type { Metadata } from "next";
import AuthForm from "@/components/auth/AuthForm";
import OAuthPanel from "@/components/auth/OAuthPanel";
import { IS_STATIC } from "@/lib/static/config";
import { Eyebrow } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "Kirjaudu | MineBet",
  description: "Kirjaudu MineBetiin Google- tai Discord-tunnuksella tai salasanalla.",
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

export default async function LoginPage() {
  const available = await providers();

  return (
    <div className="glass panel-lit rise w-full max-w-[420px] p-7 sm:p-9">
      <Eyebrow>Tervetuloa takaisin</Eyebrow>
      <h1 className="font-serif-display mt-3 text-3xl leading-tight">Kirjaudu sisään</h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
        Saldosi, pelihistoriasi ja Minecraft-liitoksesi odottavat.
      </p>
      <div className="mt-7 space-y-4">
        <OAuthPanel
          providers={available}
          mode="login"
          showSetupHint={process.env.NODE_ENV !== "production"}
        />
        <AuthForm mode="login" />
      </div>
    </div>
  );
}
