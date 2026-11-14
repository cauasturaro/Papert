const renewalLockName = "papert:session-renewal";
const rotatedAtKey = "papert:session-rotated-at";

// Another tab's rotation this recent already renewed the shared cookies; this tab only
// needs to read the session again.
export const RECENT_ROTATION_MS = 30_000;

type LockManagerLike = Pick<LockManager, "request">;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export type RenewalEnvironment = {
  locks: LockManagerLike | null;
  storage: StorageLike | null;
  now: () => number;
};

function browserEnvironment(): RenewalEnvironment {
  const browser = typeof window !== "undefined";

  return {
    locks: browser && navigator.locks ? navigator.locks : null,
    storage: browser ? safeStorage() : null,
    now: Date.now,
  };
}

function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function rotatedRecently(environment: RenewalEnvironment) {
  const stored = Number(environment.storage?.getItem(rotatedAtKey) ?? 0);

  return environment.now() - stored < RECENT_ROTATION_MS;
}

function recordRotation(environment: RenewalEnvironment) {
  try {
    environment.storage?.setItem(rotatedAtKey, String(environment.now()));
  } catch {
    // Without storage, tabs only coordinate through the lock.
  }
}

function isUnauthorized(error: unknown) {
  return (
    !!error &&
    typeof error === "object" &&
    "status" in error &&
    error.status === 401
  );
}

/**
 * Renews the session once across all tabs. Tabs wait for each other's renewal; a tab that
 * gets the lock right after another tab rotated the refresh token only re-reads the
 * session, because presenting the replaced token again would fail.
 */
export async function renewSession<T>(
  refresh: () => Promise<T>,
  read: () => Promise<T>,
  environment: RenewalEnvironment = browserEnvironment(),
): Promise<T> {
  async function renewOnce() {
    if (rotatedRecently(environment)) {
      return read();
    }

    const renewed = await refresh();
    recordRotation(environment);

    return renewed;
  }

  if (!environment.locks) {
    return renewOnce();
  }

  return environment.locks.request(renewalLockName, renewOnce);
}

/** Reads the session; an expired access token is renewed once and the read is answered by it. */
export async function readSessionWithRenewal<T>(
  read: () => Promise<T>,
  refresh: () => Promise<T>,
  environment: RenewalEnvironment = browserEnvironment(),
): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (!isUnauthorized(error)) {
      throw error;
    }

    return renewSession(refresh, read, environment);
  }
}
