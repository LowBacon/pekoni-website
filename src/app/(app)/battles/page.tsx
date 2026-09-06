import type { Metadata } from "next";
import BattlesView from "@/components/battles/BattlesView";

export const metadata: Metadata = {
  title: "Case Battles | Pekoni",
  description:
    "Avaa caset vastakkain. Classic, Team Battle ja Crazy Mode — kaikki avaukset paljastuvat samaan tahtiin ja koko potti menee voittajalle.",
};

export default function BattlesPage() {
  return <BattlesView />;
}
