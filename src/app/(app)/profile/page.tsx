import type { Metadata } from "next";
import ProfileView from "@/components/profile/ProfileView";

export const metadata: Metadata = {
  title: "Profile | Pekoni",
  description:
    "Hahmosi maja Pekonissa — taso, saldo, tilastot, saavutukset ja koko pelihistoriasi yhdessä paikassa.",
};

export default function ProfilePage() {
  return <ProfileView />;
}
