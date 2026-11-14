import { Suspense } from "react";
import { Navbar } from "@/components/app/navbar";
import { AccountCard } from "./account-card";
import { AccountCardSkeleton } from "./account-card-skeleton";

export default function Account() {
  return (
    <>
      <Navbar />

      <main
        id="main-content"
        tabIndex={-1}
        className="flex flex-1 items-center justify-center bg-muted/40 px-4 py-16"
      >
        {/* The mode and the destination come from the URL. */}
        <Suspense fallback={<AccountCardSkeleton />}>
          <AccountCard />
        </Suspense>
      </main>
    </>
  );
}
