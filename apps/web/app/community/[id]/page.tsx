import type { Metadata } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { coreApiUrl } from "@/lib/api/core-url";
import { DetailsLoading, DetailsView } from "../details-view";
import { BackToCatalog } from "../back-to-catalog";

const FALLBACK_TITLE = "Community roadmap";
const ROADMAP_ID = /^[a-z0-9-]{1,100}$/;

type PublicRoadmap = { title?: unknown; description?: unknown };

// The catalog needs a signed-in learner, so the title is read with the visitor's cookies.
async function readRoadmap(id: string): Promise<PublicRoadmap | null> {
  if (!ROADMAP_ID.test(id)) {
    return null;
  }

  const cookieHeader = (await cookies()).toString();

  try {
    const response = await fetch(`${coreApiUrl()}/community/roadmaps/${id}`, {
      headers: cookieHeader ? { cookie: cookieHeader } : {},
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: PageProps<"/community/[id]">): Promise<Metadata> {
  const { id } = await params;
  const roadmap = await readRoadmap(id);

  if (!roadmap || typeof roadmap.title !== "string") {
    return { title: FALLBACK_TITLE };
  }

  const description =
    typeof roadmap.description === "string" ? roadmap.description : undefined;

  return {
    title: roadmap.title,
    description,
    openGraph: {
      title: roadmap.title,
      description,
      type: "article",
      siteName: "Papert",
    },
  };
}

async function RequestTime() {
  await connection();

  return null;
}

// Every community view is per-user and uncached; the ID is read again on the client.
export default function CommunityRoadmapPage() {
  return (
    <>
      <BackToCatalog />

      <Suspense fallback={<DetailsLoading />}>
        <DetailsView />
      </Suspense>

      {/* Marks the per-visitor metadata as intentionally rendered at request time. */}
      <Suspense>
        <RequestTime />
      </Suspense>
    </>
  );
}
