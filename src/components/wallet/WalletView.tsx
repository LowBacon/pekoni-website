"use client";

import PekoniScene from "@/components/env/PekoniScene";
import Atmosphere from "@/components/env/Atmosphere";
import { Eyebrow, VirtualCurrencyNote } from "@/components/ui/primitives";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { formatCoins } from "@/lib/format";
import MinecraftLinkCard from "./MinecraftLinkCard";
import TransferPanel from "./TransferPanel";

/**
 * The wallet.
 *
 * Ordered by what a player came here to do: see the balance, confirm the game
 * account is connected, then move coins. The closed-loop disclosure sits at the
 * bottom of the page rather than in fine print beside the button, because it is
 * context, not a warning about the action.
 */
export default function WalletView() {
  const { player, balance } = usePlayer();

  return (
    <div className="relative isolate">
      <div className="env">
        <PekoniScene scene="library" variant="settings" className="h-full w-full" intensity={0.7} />
        <Atmosphere scene="library" density={0.35} />
        <div className="env-fog" />
        <div className="grain" />
        <div
          className="absolute inset-x-0 bottom-0 h-2/3"
          style={{ background: "linear-gradient(to bottom, transparent, var(--color-obsidian-950) 80%)" }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[880px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <section className="rise">
          <Eyebrow>Lompakko</Eyebrow>
          <h1 className="font-serif-display mt-3 text-[clamp(2.2rem,6vw,3.4rem)] leading-[0.96] tracking-[-0.03em]">
            Saldo ja siirrot
          </h1>
          <p className="text-pretty mt-4 max-w-[60ch] text-[15px] leading-relaxed text-[var(--text-dim)]">
            Pekoni Coins on suljetun kierron pelivaluutta. Voit siirtää sitä Minecraft-hahmollesi
            omalla palvelimellamme — mutta et vaihtaa rahaksi.
          </p>
        </section>

        <section className="panel panel-lit mb-wave mb-lift mt-8 p-6">
          <Eyebrow>Käytettävissä</Eyebrow>
          <p className="balance mt-2 text-[clamp(2rem,7vw,3rem)] font-bold leading-none tracking-[-0.03em] text-[var(--color-emerald-300)]">
            {formatCoins(balance)}
          </p>
          <p className="mt-2 text-[13px] text-[var(--text-muted)]">
            Pekoni Coins · {player?.username}
          </p>
        </section>

        <div className="mt-4 space-y-4">
          <MinecraftLinkCard />
          <TransferPanel />
        </div>

        <div className="panel mt-4 p-6">
          <VirtualCurrencyNote />
        </div>
      </div>
    </div>
  );
}
