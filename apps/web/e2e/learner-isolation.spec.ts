import { expect, test } from "@playwright/test";
import {
  codeEditor,
  newLearner,
  replaceFile,
  signIn,
  signOut,
  signUp,
  startCommunityRoadmap,
} from "./support/learner";

const ROADMAP = "Hexagonal Architecture with NestJS";
const DOMAIN_FILE = "src/domain/reservation.ts";
const DRAFT = 'export const owner = "first-learner-draft";\n';

test("a second learner on the same browser never sees the first learner's draft", async ({
  page,
}) => {
  const first = newLearner();
  const second = newLearner();

  await signUp(page, first);
  const firstWorkspace = await startCommunityRoadmap(page, ROADMAP);
  await replaceFile(page, DOMAIN_FILE, DRAFT);
  await signOut(page, first);

  await signUp(page, second);
  await page.goto(firstWorkspace);

  await expect(
    page.getByRole("heading", { name: "Study space not found" }),
  ).toBeVisible();
  await expect(page.getByText("first-learner-draft")).toHaveCount(0);

  await startCommunityRoadmap(page, ROADMAP);
  await page.getByRole("button", { name: DOMAIN_FILE, exact: true }).click();

  await expect(codeEditor(page)).toContainText("Model reservation rules.");
  await expect(codeEditor(page)).not.toContainText("first-learner-draft");

  await signOut(page, second);
  await signIn(page, first);
  await page.goto(firstWorkspace);
  await page.getByRole("button", { name: DOMAIN_FILE, exact: true }).click();

  await expect(codeEditor(page)).toContainText("first-learner-draft");
});
