import type { Metadata } from "next";
import CaserView from "@/components/cases/CaserView";

export const metadata: Metadata = {
  title: "Cases | MineBet",
  description:
    "Pekonin tutkimusmatkailijan holvi — kahdeksan arkkua, julkiset pudotustodennäköisyydet ja palvelimella arvottu sisältö.",
};

export default function CaserPage() {
  return <CaserView />;
}
