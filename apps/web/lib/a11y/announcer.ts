export type Politeness = "polite" | "assertive";

export const announcerRegionIds: Record<Politeness, string> = {
  polite: "papert-announcer-polite",
  assertive: "papert-announcer-assertive",
};

// Repeats of the same phrase inside this window are dropped.
const REPEAT_WINDOW_MS = 1500;
// Screen readers read a change more reliably after the region was briefly empty.
const WRITE_DELAY_MS = 60;
const CLEAR_AFTER_MS = 6000;

type RegionState = {
  last: string;
  lastAt: number;
  writeTimer?: ReturnType<typeof setTimeout>;
  clearTimer?: ReturnType<typeof setTimeout>;
};

const regions: Record<Politeness, RegionState> = {
  polite: { last: "", lastAt: 0 },
  assertive: { last: "", lastAt: 0 },
};

/** Whether a phrase should be spoken, given the previous one and when it was spoken. */
export function shouldAnnounce(
  message: string,
  previous: string,
  previousAt: number,
  now: number,
) {
  if (!message) {
    return false;
  }

  return message !== previous || now - previousAt > REPEAT_WINDOW_MS;
}

/**
 * Speaks a short phrase through the shared live region mounted by `AnnouncementRegion`.
 * Use "assertive" only for errors that block the learner. Safe to call outside React.
 */
export function announce(message: string, politeness: Politeness = "polite") {
  if (typeof document === "undefined") {
    return;
  }

  const text = message.trim();
  const state = regions[politeness];
  const now = Date.now();

  if (!shouldAnnounce(text, state.last, state.lastAt, now)) {
    return;
  }

  const region = document.getElementById(announcerRegionIds[politeness]);

  if (!region) {
    return;
  }

  state.last = text;
  state.lastAt = now;
  clearTimeout(state.writeTimer);
  clearTimeout(state.clearTimer);

  region.textContent = "";

  state.writeTimer = setTimeout(() => {
    region.textContent = text;
  }, WRITE_DELAY_MS);

  state.clearTimer = setTimeout(() => {
    region.textContent = "";
  }, CLEAR_AFTER_MS);
}
