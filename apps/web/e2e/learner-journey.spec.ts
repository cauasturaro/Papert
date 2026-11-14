import { expect, test } from "@playwright/test";
import {
  codeEditor,
  newLearner,
  replaceFile,
  signUp,
  startCommunityRoadmap,
} from "./support/learner";

const ROADMAP = "Hexagonal Architecture with NestJS";
const DOMAIN_FILE = "src/domain/reservation.ts";

// Valid TypeScript without the starter TODO, which the demo model's review approves.
const RESERVATION = [
  "export class InvalidReservation extends Error {}",
  "export function reserve(workshop: string, seats: number) {",
  "if (!workshop || !Number.isInteger(seats) || seats < 1) {",
  'throw new InvalidReservation("invalid reservation");',
  "}",
  "return { workshop, seats };",
  "}",
  "",
].join("\n");

test("a learner edits a step, asks Seymour, gets it approved and finds it all after a reload", async ({
  page,
}) => {
  const learner = newLearner();
  const steps = page.getByRole("list", { name: "Roadmap steps" });
  const conversation = page.getByRole("log", {
    name: "Conversation with Seymour",
  });
  const analysis = page.getByRole("region", { name: "Analysis" });

  await signUp(page, learner);
  await startCommunityRoadmap(page, ROADMAP);

  await expect(page.getByText("Step 1 of 4")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Acceptance criteria (0 of 2 met)" }),
  ).toBeVisible();

  await replaceFile(page, DOMAIN_FILE, RESERVATION);

  await expect(codeEditor(page)).toContainText("InvalidReservation");

  await page.getByRole("button", { name: "Show Seymour" }).click();
  await page
    .getByRole("combobox", { name: "Message Seymour" })
    .fill("How do I start this step?");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(conversation).toContainText(
    "You asked: “How do I start this step?”",
  );
  await expect(conversation).toContainText(
    "This step has 2 acceptance criteria",
  );

  await page.getByRole("button", { name: "Check my solution" }).click();

  await expect(
    analysis.getByRole("heading", {
      name: "Step 1 approved · Step 2 unlocked",
    }),
  ).toBeVisible();
  await expect(analysis).toContainText("Met (2 of 2)");

  await page.reload();

  await expect(page.getByText("Step 2 of 4")).toBeVisible();
  await expect(
    steps.getByRole("heading", {
      name: "1. Keep the rule inside the domain Completed",
    }),
  ).toBeVisible();
  await expect(
    steps.getByRole("heading", {
      name: "2. Describe what the use case needs Current step",
    }),
  ).toBeVisible();

  await page.getByRole("treeitem", { name: "reservation.ts" }).click();

  await expect(codeEditor(page)).toContainText("InvalidReservation");
});
