import { getQueryClient } from "../api/query-client.ts";

const storagePrefix = "papert:";

// Who the stored entries belong to, so a different account signing in on this device
// does not inherit them, even after a reload or an expired session.
const ownerKey = "papert:owner";

// Fallback owner for this tab when storage is unavailable.
let tabOwner: string | null = null;

// Device preferences that are not about the learner's work; everything else under the
// prefix (drafts, recovery copies, open tabs, hints) belongs to whoever was signed in.
const deviceKeys = new Set([
  "papert:theme",
  "papert:editor-settings",
  "papert:study-panel-sizes",
  "papert:study-collapsed-panels",
]);

/** Keys a sign-out removes: every `papert:` entry except device preferences. */
export function userStorageKeys(storage: Storage) {
  const keys: string[] = [];

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);

    if (key?.startsWith(storagePrefix) && !deviceKeys.has(key)) {
      keys.push(key);
    }
  }

  return keys;
}

function clearStorage(storage: Storage) {
  for (const key of userStorageKeys(storage)) {
    storage.removeItem(key);
  }
}

/** Drops cached server data and per-user browser storage so the next account starts clean. */
export function clearUserData() {
  getQueryClient().clear();
  tabOwner = null;

  if (typeof window === "undefined") {
    return;
  }

  try {
    clearStorage(window.localStorage);
    clearStorage(window.sessionStorage);
  } catch {
    // Storage can be unavailable (private mode, blocked); the cache is already cleared.
  }
}

function readOwner() {
  try {
    return window.localStorage.getItem(ownerKey);
  } catch {
    return null;
  }
}

function writeOwner(userId: string) {
  try {
    window.localStorage.setItem(ownerKey, userId);
  } catch {
    // Without storage there is nothing to hand over to the next account.
  }
}

/**
 * Records `userId` as the signed-in account. Data left by a different account is cleared
 * first; returns whether that happened.
 */
export function adoptUserData(userId: string) {
  if (typeof window === "undefined") {
    return false;
  }

  const owner = readOwner() ?? tabOwner;
  const switched = owner !== null && owner !== userId;

  if (switched) {
    clearUserData();
  }

  tabOwner = userId;
  writeOwner(userId);

  return switched;
}
