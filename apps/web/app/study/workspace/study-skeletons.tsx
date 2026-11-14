import { Skeleton } from "@/components/ui/skeleton/skeleton";

/** Placeholder matching the IDE: navbar, then challenge, files, editor over analysis, Seymour. */
export function WorkspaceSkeleton() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <p role="status" className="sr-only">
        Loading your study space…
      </p>

      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        <Skeleton className="size-7 shrink-0 rounded-md" />
        <Skeleton className="max-w-64" />
        <Skeleton className="ml-auto max-w-40" />
      </div>

      <div className="flex min-h-0 flex-1 gap-1.5 bg-border/40 p-1.5 max-lg:flex-col max-lg:p-0">
        <div className="panel-surface flex flex-[24_1_0%] flex-col gap-3 p-4">
          <Skeleton size="lg" className="max-w-48" />
          <Skeleton />
          <Skeleton />
          <Skeleton className="max-w-60" />
        </div>

        <div className="panel-surface flex flex-[16_1_0%] flex-col gap-2 p-4 max-lg:hidden">
          <Skeleton size="sm" />
          <Skeleton size="sm" />
          <Skeleton size="sm" className="max-w-24" />
        </div>

        <div className="flex flex-[40_1_0%] flex-col gap-1.5 max-lg:hidden">
          <div className="panel-surface flex flex-[72_1_0%] flex-col gap-2 p-4">
            <Skeleton size="sm" className="max-w-72" />
            <Skeleton size="sm" className="max-w-56" />
            <Skeleton size="sm" className="max-w-80" />
          </div>

          <div className="panel-surface flex-[28_1_0%] p-4">
            <Skeleton size="sm" className="max-w-40" />
          </div>
        </div>

        <div className="panel-surface flex flex-[24_1_0%] flex-col justify-end gap-2 p-4 max-xl:hidden">
          <Skeleton className="h-20" />
        </div>
      </div>
    </div>
  );
}

/** Placeholder for the study home and the roadmap creator. */
export function StudyPageSkeleton() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <p role="status" className="sr-only">
        Loading…
      </p>

      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        <Skeleton className="size-7 shrink-0 rounded-md" />
        <Skeleton className="max-w-48" />
      </div>

      <div className="flex flex-1 justify-center bg-muted/40 p-4 sm:p-6">
        <div className="flex w-full max-w-4xl flex-col gap-4">
          <Skeleton size="lg" className="max-w-64" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    </div>
  );
}
