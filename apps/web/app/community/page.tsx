import type { Metadata } from "next";
import { CatalogView } from "./catalog-view";

export const metadata: Metadata = {
  title: "Community roadmaps",
};

export default function CommunityPage() {
  return <CatalogView />;
}
