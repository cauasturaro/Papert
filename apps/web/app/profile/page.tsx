import type { Metadata } from "next";
import { ProfileView } from "./profile-view";

export const metadata: Metadata = {
  title: "Your progress",
};

export default function ProfilePage() {
  return <ProfileView />;
}
