import type { Metadata } from "next";
import DailyCaseView from "@/components/cases/DailyCaseView";

export const metadata: Metadata = {
  title: "Daily Case | Pekoni",
  description:
    "Avaa ilmainen palkinto kerran päivässä. Metsäaukion huoltoarkku täyttyy joka vuorokausi Pekonin pelaajille.",
};

export default function DailyCasePage() {
  return <DailyCaseView />;
}
