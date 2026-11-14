import { strict as assert } from "node:assert";
import { beforeEach, test } from "node:test";
import { getQueryClient } from "../api/query-client.ts";
import { adoptUserData, clearUserData, userStorageKeys } from "./user-data.ts";

class MemoryStorage {
  #items = new Map();

  get length() {
    return this.#items.size;
  }

  key(index) {
    return [...this.#items.keys()][index] ?? null;
  }

  getItem(key) {
    return this.#items.get(key) ?? null;
  }

  setItem(key, value) {
    this.#items.set(key, String(value));
  }

  removeItem(key) {
    this.#items.delete(key);
  }
}

function seedLearnerData() {
  window.localStorage.setItem("papert:recovery:w1", "{}");
  window.localStorage.setItem("papert:seymour-draft:w1:new", "draft");
  window.localStorage.setItem("papert:theme", "dark");
  window.localStorage.setItem("papert:editor-settings", "{}");
  window.localStorage.setItem("other-app", "kept");
  window.sessionStorage.setItem("papert:roadmap-goal", "Learn Go");
  getQueryClient().setQueryData(["drafts"], [{ id: "d1" }]);
}

beforeEach(() => {
  globalThis.window = {
    localStorage: new MemoryStorage(),
    sessionStorage: new MemoryStorage(),
  };
  getQueryClient().clear();
});

test("signing out removes cached queries and learner storage but keeps device preferences", () => {
  seedLearnerData();

  clearUserData();

  assert.equal(getQueryClient().getQueryData(["drafts"]), undefined);
  assert.equal(window.localStorage.getItem("papert:recovery:w1"), null);
  assert.equal(
    window.localStorage.getItem("papert:seymour-draft:w1:new"),
    null,
  );
  assert.equal(window.sessionStorage.getItem("papert:roadmap-goal"), null);
  assert.equal(window.localStorage.getItem("papert:theme"), "dark");
  assert.equal(window.localStorage.getItem("papert:editor-settings"), "{}");
  assert.equal(window.localStorage.getItem("other-app"), "kept");
});

test("a different account signing in does not inherit the previous account's data", () => {
  adoptUserData("user-a");
  seedLearnerData();

  const switched = adoptUserData("user-b");

  assert.equal(switched, true);
  assert.equal(getQueryClient().getQueryData(["drafts"]), undefined);
  assert.equal(window.localStorage.getItem("papert:recovery:w1"), null);
  assert.equal(window.localStorage.getItem("papert:owner"), "user-b");
});

test("the same account signing in again keeps its unsaved drafts", () => {
  adoptUserData("user-a");
  seedLearnerData();

  const switched = adoptUserData("user-a");

  assert.equal(switched, false);
  assert.equal(window.localStorage.getItem("papert:recovery:w1"), "{}");
  assert.deepEqual(getQueryClient().getQueryData(["drafts"]), [{ id: "d1" }]);
});

test("only papert entries outside the device preferences count as learner data", () => {
  seedLearnerData();

  const keys = userStorageKeys(window.localStorage);

  assert.deepEqual(keys.sort(), [
    "papert:recovery:w1",
    "papert:seymour-draft:w1:new",
  ]);
});
