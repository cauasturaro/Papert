import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  dismissSessionExpired,
  isSessionExpired,
  markSignedIn,
  markSignedOut,
  reportUnauthorized,
  safeNextPath,
  signInHref,
  subscribeToSessionExpiry,
} from "./session-signal.ts";

test("a 401 counts as expiry only after a confirmed session", () => {
  let notifications = 0;
  const unsubscribe = subscribeToSessionExpiry(() => {
    notifications += 1;
  });

  reportUnauthorized();
  assert.equal(isSessionExpired(), false);

  markSignedIn();
  reportUnauthorized();
  reportUnauthorized();
  assert.equal(isSessionExpired(), true);
  assert.equal(notifications, 1);

  markSignedIn();
  assert.equal(isSessionExpired(), false);

  markSignedOut();
  reportUnauthorized();
  assert.equal(isSessionExpired(), false);

  markSignedIn();
  reportUnauthorized();
  dismissSessionExpired();
  reportUnauthorized();
  assert.equal(isSessionExpired(), false);

  unsubscribe();
});

test("sign-in links return only to same-site paths", () => {
  assert.equal(
    signInHref("/study/w1?step=2"),
    "/account?next=%2Fstudy%2Fw1%3Fstep%3D2",
  );

  assert.equal(safeNextPath("/study/w1?step=2"), "/study/w1?step=2");
  assert.equal(safeNextPath("//evil.example"), null);
  assert.equal(safeNextPath("https://evil.example"), null);
  assert.equal(safeNextPath("/\\evil.example"), null);
  assert.equal(safeNextPath(null), null);
});
