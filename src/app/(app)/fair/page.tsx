import type { Metadata } from "next";
import FairView from "@/components/fair/FairView";

export const metadata: Metadata = {
  title: "Provably Fair | MineBet",
  description:
    "Tarkista mikä tahansa pelattu kierros itse. Laskenta tapahtuu selaimessasi, ei palvelimellamme.",
};

export default function FairPage() {
  return <FairView />;
}
