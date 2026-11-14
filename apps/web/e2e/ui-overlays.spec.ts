import { expect, test } from "@playwright/test";
import { newLearner, signUp, startCommunityRoadmap } from "./support/learner";

test.beforeEach(async ({ page }) => {
  await signUp(page, newLearner());
  await startCommunityRoadmap(page, "Hexagonal Architecture with NestJS");
});

test("tooltip stays open while hovered and Escape dismisses it", async ({ page }) => {
  const trigger = page.getByRole("button", { name: "Download my files", exact: true });
  const tooltip = page.getByRole("tooltip", { name: "Download my files", exact: true });
  await trigger.hover();
  await expect(tooltip).toBeVisible();

  await tooltip.hover();
  await page.waitForTimeout(250);

  await expect(tooltip).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(tooltip).toBeHidden();
});

test("keyboard shortcuts dialog traps focus and dismisses with Escape", async ({ page }) => {
  const settings = page.getByRole("button", { name: "Settings", exact: true });
  await settings.click();
  await page.getByRole("menuitem", { name: "Keyboard shortcuts", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts", exact: true });
  await expect(dialog).toBeVisible();
  const close = dialog.getByRole("button", { name: "Close", exact: true }).first();
  await close.focus();

  await page.keyboard.press("Tab");

  await expect(dialog.locator(":focus")).toHaveCount(1);

  await page.keyboard.press("Shift+Tab");

  await expect(close).toBeFocused();

  await page.keyboard.press("Escape");

  await expect(dialog).toBeHidden();
});

test("tooltip dismisses when its keyboard trigger loses focus", async ({ page }) => {
  const trigger = page.getByRole("button", { name: "Download my files", exact: true });
  const tooltip = page.getByRole("tooltip", { name: "Download my files", exact: true });
  await trigger.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(tooltip).toBeVisible();

  await page.keyboard.press("Tab");

  await expect(tooltip).toBeHidden();
});
