import { expect, test } from "@playwright/test";

// Helper: log in via the UI
async function login(page: Parameters<typeof test>[1] extends (args: { page: infer P }) => unknown ? P : never) {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  // Clear session so each test starts unauthenticated unless it explicitly logs in
  await page.goto("/");
  await page.evaluate(() => localStorage.removeItem("pm_session"));
});

// --- Auth ---

test("shows login form when not authenticated", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Username")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
});

test("shows error for invalid credentials", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("wrong");
  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByText(/invalid username or password/i)).toBeVisible();
});

test("logs in with correct credentials and sees the board", async ({ page }) => {
  await login(page);
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("logs out and returns to the login form", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: /sign out/i }).click();
  await expect(page.getByLabel("Username")).toBeVisible();
});

test("session persists across page reload", async ({ page }) => {
  await login(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
});

// --- Board (authenticated) ---

test("loads the kanban board with five columns", async ({ page }) => {
  await login(page);
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("adds a card to a column", async ({ page }) => {
  await login(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Playwright card");
  await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Playwright card").first()).toBeVisible();
});

test("cancel discards a new card form without adding", async ({ page }) => {
  await login(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  const initialCount = await firstColumn.locator('[data-testid^="card-"]').count();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Discarded card");
  await firstColumn.getByRole("button", { name: /cancel/i }).click();
  await expect(firstColumn.getByText("Discarded card")).not.toBeVisible();
  await expect(firstColumn.locator('[data-testid^="card-"]')).toHaveCount(initialCount);
});

test("renames a column", async ({ page }) => {
  await login(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  const input = firstColumn.getByLabel("Column title");
  await input.clear();
  await input.fill("Renamed Column");
  await expect(input).toHaveValue("Renamed Column");
});

test("removes a card from a column", async ({ page }) => {
  await login(page);
  // Add a card first so there is always something to remove regardless of DB state
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Remove me");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Remove me")).toBeVisible();

  const card = firstColumn.locator('[data-testid^="card-"]').last();
  // KanbanCard uses aria-label="Delete [title]" so accessible name is "Delete Remove me"
  await card.getByRole("button", { name: /delete remove me/i }).click();
  await expect(firstColumn.getByText("Remove me")).not.toBeVisible();
});

test("moves a card between columns and persists", async ({ page }) => {
  await login(page);
  // Use a unique title so repeated test runs don't accumulate duplicates in the DB
  const cardTitle = `Move-${Date.now()}`;
  const firstColumn = page.locator('[data-testid^="column-"]').first();

  // Add a card via the UI
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill(cardTitle);
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText(cardTitle)).toBeVisible();

  // Fetch the board to get the real card ID and target column ID
  const board = await page.evaluate(() =>
    fetch("/api/board").then((r) => r.json())
  );
  const cardId = board.columns[0].cardIds.at(-1);
  const targetColId = parseInt(board.columns[1].id); // Discovery

  // Move the card via the backend API (same call that drag-and-drop makes)
  await page.evaluate(
    ({ cardId, targetColId }) =>
      fetch(`/api/cards/${cardId}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ column_id: targetColId, position: 0 }),
      }),
    { cardId, targetColId }
  );

  // Reload to confirm the move persisted
  await page.reload();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  const targetColumn = page.locator('[data-testid^="column-"]').nth(1);
  await expect(targetColumn.getByText(cardTitle)).toBeVisible();
});

// --- AI chat sidebar ---

test("AI chat sidebar sends a message and shows a response", async ({ page }) => {
  // Intercept the AI chat API call so the test does not need a real OpenRouter key
  await page.route("**/api/ai/chat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        message: "I have added a card for you.",
        board: {
          columns: [
            { id: "1", title: "Backlog", cardIds: [] },
            { id: "2", title: "Discovery", cardIds: [] },
            { id: "3", title: "In Progress", cardIds: [] },
            { id: "4", title: "Review", cardIds: [] },
            { id: "5", title: "Done", cardIds: [] },
          ],
          cards: {},
        },
      }),
    });
  });

  await login(page);
  const textarea = page.getByLabel("Chat message");
  await textarea.fill("Add a card please");
  await page.getByRole("button", { name: /send/i }).click();
  await expect(page.getByText("Add a card please")).toBeVisible();
  await expect(page.getByText("I have added a card for you.")).toBeVisible();
});
