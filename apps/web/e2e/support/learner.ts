import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";

export const PASSWORD = "correct horse battery staple";

export type Learner = { email: string; password: string };

export function newLearner(): Learner {
  return { email: `learner-${randomUUID()}@example.com`, password: PASSWORD };
}

async function submitAccountForm(page: Page, learner: Learner, label: string) {
  // The form renders only after the client has checked the session.
  await expect(page.getByRole("button", { name: label })).toBeEnabled();
  await page.getByLabel("Email").fill(learner.email);
  await page.getByLabel("Password", { exact: true }).fill(learner.password);
  await page.getByRole("button", { name: label }).click();

  await expect(
    page.getByRole("button", { name: `Account menu for ${learner.email}` }),
  ).toBeVisible();
}

export async function signUp(page: Page, learner: Learner) {
  await page.goto("/account?mode=register");
  await expect(
    page.getByRole("heading", { name: "Create your free account" }),
  ).toBeVisible();

  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "minlength",
    "12",
  );
  await submitAccountForm(page, learner, "Create account");
}

export async function signIn(page: Page, learner: Learner) {
  await page.goto("/account");
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();

  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "minlength",
    "1",
  );
  await submitAccountForm(page, learner, "Sign in");
}

export async function signOut(page: Page, learner: Learner) {
  await page
    .getByRole("button", { name: `Account menu for ${learner.email}` })
    .click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();

  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
}

/** Starts a showcase roadmap from the community catalog; resolves on its workspace URL. */
export async function startCommunityRoadmap(page: Page, title: string) {
  await page.goto("/community");
  await page
    .getByRole("article", { name: title })
    .getByRole("link", { name: "View roadmap" })
    .click();

  await expect(
    page.getByRole("heading", { name: title, level: 1 }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start studying" }).click();
  await page
    .getByRole("dialog", { name: `Start “${title}”?` })
    .getByRole("button", { name: "Start studying" })
    .click();

  await page.waitForURL(/\/study\/[0-9a-f-]{36}/);

  return new URL(page.url()).pathname;
}

/** Replaces a file's content in Monaco and waits for the autosave to finish. */
export async function replaceFile(page: Page, path: string, content: string) {
  await page.getByRole("button", { name: path, exact: true }).click();

  const editor = page.getByRole("textbox", { name: `Code editor: ${path}` });
  await editor.focus();

  // The Desktop Chrome profile reports Windows, so Monaco binds select-all to Control.
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText(content);

  // "Saved" alone is the state on load; the timestamp appears only after a save.
  await expect(page.getByRole("banner").getByText(/^Saved · /)).toBeVisible();
}

export function codeEditor(page: Page) {
  return page.getByRole("region", { name: "Code editor panel" });
}
