import type { Metadata } from "next";
import SettingsView from "@/components/settings/SettingsView";

export const metadata: Metadata = {
  title: "Settings | Pekoni",
  description:
    "Hallitse ääniä, liikettä, Minecraft-identiteettiä ja kierrosten todennettavuutta Pekonissa.",
};

export default function SettingsPage() {
  return <SettingsView />;
}
