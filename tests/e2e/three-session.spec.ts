import { expect, test } from "@playwright/test";

const supabaseReady = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);

test("host and two participants estimate privately, reveal, save, and recover", async ({ browser }) => {
  test.skip(!supabaseReady, "Configure the Supabase URL and server-only service-role key to run the three-session acceptance test.");

  const hostContext = await browser.newContext();
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const host = await hostContext.newPage();
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();

  try {
    await host.goto("/");
    await host.getByLabel("ROOM NAME").fill("Three-session acceptance");
    await host.getByLabel("YOUR NAME").fill("Host Mira");
    await host.getByRole("button", { name: "Open a room" }).click();
    await expect(host.getByText("THE TABLE IS YOURS")).toBeVisible();

    const inviteUrl = host.url();
    const roomId = new URL(inviteUrl).pathname.split("/").at(-1);
    const apiOrigin = new URL(inviteUrl).origin;
    expect(roomId).toBeTruthy();
    await host.getByLabel("TASK TITLE").fill("Paginate the activity feed");
    await host.getByRole("button", { name: "Add task" }).click();
    await expect(host.getByRole("heading", { name: "Paginate the activity feed" })).toBeVisible();

    for (const [page, name] of [[first, "Participant A"], [second, "Participant B"]] as const) {
      await page.goto(inviteUrl);
      await page.getByLabel("YOUR NAME").fill(name);
      await page.getByRole("button", { name: "Join the room" }).click();
      await expect(page.getByRole("heading", { name: "Paginate the activity feed" })).toBeVisible();
    }

    await expect(host.getByText("Participant A")).toBeVisible();
    await expect(host.getByText("Participant B")).toBeVisible();

    const firstVoteResponse = first.waitForResponse((response) =>
      response.url().includes(`/api/rooms/${roomId}`) && response.request().method() === "POST",
    );
    await first.getByLabel("Your estimate").fill("3.25");
    await first.getByRole("button", { name: "Vote" }).click();
    const firstVote = await (await firstVoteResponse).json();
    expect(JSON.stringify(firstVote)).toContain("3.25");
    expect(JSON.stringify(firstVote)).not.toContain("8.5");
    await expect(first.getByText(/Your vote: 3\.25/)).toBeVisible();

    const secondVoteResponse = second.waitForResponse((response) =>
      response.url().includes(`/api/rooms/${roomId}`) && response.request().method() === "POST",
    );
    await second.getByLabel("Your estimate").fill("8.5");
    await second.getByRole("button", { name: "Vote" }).click();
    const secondVote = await (await secondVoteResponse).json();
    expect(JSON.stringify(secondVote)).toContain("8.5");
    expect(JSON.stringify(secondVote)).not.toContain("3.25");

    const [hostRead, firstRead, secondRead] = await Promise.all([
      hostContext.request.get(`${apiOrigin}/api/rooms/${roomId}`),
      firstContext.request.get(`${apiOrigin}/api/rooms/${roomId}`),
      secondContext.request.get(`${apiOrigin}/api/rooms/${roomId}`),
    ]);
    const [hostSnapshot, firstSnapshot, secondSnapshot] = await Promise.all([
      hostRead.json(), firstRead.json(), secondRead.json(),
    ]);
    expect(JSON.stringify(hostSnapshot)).not.toContain("3.25");
    expect(JSON.stringify(hostSnapshot)).not.toContain("8.5");
    expect(JSON.stringify(firstSnapshot)).toContain("3.25");
    expect(JSON.stringify(firstSnapshot)).not.toContain("8.5");
    expect(JSON.stringify(secondSnapshot)).toContain("8.5");
    expect(JSON.stringify(secondSnapshot)).not.toContain("3.25");
    await expect(host.locator(".vote-status-done")).toHaveCount(2);

    for (const action of [
      { action: "add-task", title: "Unauthorized task" },
      { action: "reveal" },
      { action: "save-result", developmentEstimate: "5", testingEstimate: "0" },
      { action: "next-round" },
    ]) {
      const response = await firstContext.request.post(`${apiOrigin}/api/rooms/${roomId}`, { data: action });
      expect(response.status(), `participant must not perform ${action.action}`).toBe(403);
    }

    await host.getByRole("button", { name: "Reveal votes" }).click();
    await expect(first.getByText("REVEALED VOTES")).toBeVisible({ timeout: 10_000 });
    await expect(second.getByText("3.25")).toBeVisible();
    await expect(first.getByText("8.5")).toBeVisible();

    await host.getByLabel("DEVELOPMENT").fill("4.25");
    await host.getByLabel("TESTING").fill("1.25");
    await expect(host.getByText("5.5", { exact: true })).toBeVisible();
    await host.getByRole("button", { name: "Save estimates" }).click();
    await expect(host.getByText("TOTAL ESTIMATE")).toBeVisible();
    await host.getByRole("button", { name: "Start next round" }).click();

    await Promise.all([host.reload(), first.reload(), second.reload()]);
    await expect(host.getByText("ROUND 02")).toBeVisible();
    await expect(first.getByText("ROUND 02")).toBeVisible();
    await expect(second.getByText("ROUND 02")).toBeVisible();
    await expect(first.getByText("Your vote: 3.25")).toHaveCount(0);
    await expect(first.getByText("Paginate the activity feed")).toBeVisible();

    await second.getByRole("button", { name: "Cannot estimate" }).click();
    await expect(second.getByText(/Your vote: Cannot estimate/)).toBeVisible();
    await host.getByRole("button", { name: "Reveal votes" }).click();
    await expect(host.getByText("Cannot estimate")).toBeVisible();
    await host.getByRole("button", { name: "Mark task unestimated" }).click();
    await expect(host.getByText("Unestimated")).toBeVisible();

    await host.getByLabel("NEXT TASK").fill("Rate-limit retries");
    await host.getByRole("button", { name: "Add task" }).click();
    await expect(host.getByRole("heading", { name: "Rate-limit retries" })).toBeVisible();
    const previousTask = host.locator(".history-disclosure[open]");
    await expect(previousTask).toHaveCount(1);
    await expect(previousTask.getByText("Participant A")).toBeVisible();
    await expect(previousTask.getByText("3.25", { exact: true })).toBeVisible();
    await expect(previousTask.getByText("4.25", { exact: true })).toBeVisible();
    await expect(previousTask.getByText("1.25", { exact: true })).toBeVisible();
    await expect(previousTask.getByText("5.5", { exact: true })).toBeVisible();
  } finally {
    await Promise.all([hostContext.close(), firstContext.close(), secondContext.close()]);
  }
});