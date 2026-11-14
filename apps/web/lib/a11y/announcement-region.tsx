import { announcerRegionIds } from "./announcer";

/** The app's single pair of live regions; mount once in the root layout. */
export function AnnouncementRegion() {
  return (
    <div className="sr-only">
      <div
        id={announcerRegionIds.polite}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      />

      <div
        id={announcerRegionIds.assertive}
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
      />
    </div>
  );
}
