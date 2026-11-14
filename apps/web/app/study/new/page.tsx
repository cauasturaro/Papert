import type { Metadata } from "next";
import { CreatorRoute } from "./creator-route";

export const metadata: Metadata = {
  title: "Create a roadmap",
};

export default function NewRoadmapPage() {
  return <CreatorRoute />;
}
