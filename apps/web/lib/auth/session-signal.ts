type Listener = () => void;

const listeners = new Set<Listener>();

// A 401 only means "expired" after this tab has seen a signed-in user; first visits and
// explicit sign-outs stay quiet.
let signedIn = false;
let expired = false;

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

/** Records a confirmed session and clears an earlier expiry. */
export function markSignedIn() {
  signedIn = true;

  if (expired) {
    expired = false;
    notify();
  }
}

/** Records a deliberate sign-out, so later 401s are not reported as an expiry. */
export function markSignedOut() {
  signedIn = false;

  if (expired) {
    expired = false;
    notify();
  }
}

/** Call when an authenticated request answers 401. */
export function reportUnauthorized() {
  if (!signedIn || expired) {
    return;
  }

  expired = true;
  notify();
}

/** Hides the expiry notice until the next 401 from a new session. */
export function dismissSessionExpired() {
  if (!expired) {
    return;
  }

  expired = false;
  signedIn = false;
  notify();
}

export function isSessionExpired() {
  return expired;
}

export function subscribeToSessionExpiry(listener: Listener) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

/** Sign-in URL that returns the learner to `path` (pathname plus search) afterwards. */
export function signInHref(path: string) {
  return `/account?next=${encodeURIComponent(path)}`;
}

/**
 * The `next` value from a sign-in URL when it is a same-site path; otherwise null.
 * Rejects absolute and protocol-relative URLs so it cannot redirect off Papert.
 */
export function safeNextPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  if (value.includes("\\") || /\p{Cc}/u.test(value)) {
    return null;
  }

  return value;
}
