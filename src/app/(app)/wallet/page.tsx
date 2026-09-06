import type { Metadata } from "next";
import WalletView from "@/components/wallet/WalletView";

export const metadata: Metadata = {
  title: "Lompakko | MineBet",
  description: "Saldo, Minecraft-liitos, siirrot palvelimelle ja tapahtumahistoria.",
  robots: { index: false, follow: false },
};

export default function WalletPage() {
  return <WalletView />;
}
