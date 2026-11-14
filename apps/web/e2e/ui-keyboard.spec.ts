import { expect, test } from "@playwright/test";
import { newLearner, signUp, startCommunityRoadmap } from "./support/learner";

test("theme menu dismisses with Escape and preserves keyboard order", async ({ page }) => {
  await page.goto("/account");
  const trigger = page.getByRole("button", { name: /^Theme:/ });

  await trigger.focus();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("menuitemradio", { name: "System" })).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(trigger).toBeFocused();
  await expect(page.getByRole("menuitemradio", { name: "System" })).toBeHidden();

  await page.keyboard.press("Tab");

  await expect(trigger).not.toBeFocused();

  await page.keyboard.press("Shift+Tab");

  await expect(trigger).toBeFocused();
});

for (const action of ["Save", "Cancel"] as const) {
  test(`Enter on rename ${action} activates that button`, async ({ page }) => {
    await signUp(page, newLearner());
    await startCommunityRoadmap(page, "Hexagonal Architecture with NestJS");
    const original = page.getByRole("treeitem", { name: "reservation.ts", exact: true });
    await original.click();
    await original.press("Shift+F10");
    await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
    const input = page.getByRole("textbox", { name: "Name (end with / for a folder)", exact: true });
    await input.fill("renamed.ts");
    const nameEditor = page.locator('[data-slot="tree-editor-name-input"]');
    await nameEditor.getByRole("button", { name: action, exact: true }).focus();

    await page.keyboard.press("Enter");

    await expect(input).toBeHidden();
    const name = action === "Save" ? "renamed.ts" : "reservation.ts";
    await expect(page.getByRole("treeitem", { name, exact: true })).toBeVisible();
    await expect(page.getByRole("treeitem", { name, exact: true })).toBeFocused();
  });
}
