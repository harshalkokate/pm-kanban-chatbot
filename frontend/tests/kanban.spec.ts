import { expect, test, type Page } from "@playwright/test";

/**
 * End-to-end tests for the multi-user PM app.
 *
 * Each test registers a fresh user via the UI so runs are isolated regardless
 * of existing database state. The legacy seeded user ("user" / "password")
 * still exists and is exercised in a separate smoke test.
 */

const uniqueUsername = () =>
  `e2e_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

async function clearStorage(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.removeItem("pm_token");
    localStorage.removeItem("pm_user");
    localStorage.removeItem("pm_active_board");
  });
}

async function register(page: Page, username: string, password = "password123") {
  await page.goto("/");
  // If already on board (from stale session), logout first
  const signOut = page.getByRole("button", { name: /sign out/i });
  if (await signOut.isVisible().catch(() => false)) {
    await signOut.click();
  }
  await page.getByRole("button", { name: /create one/i }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page.getByRole("heading", { name: "My Board" })).toBeVisible();
}

async function loginLegacyUser(page: Page) {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.locator('[data-testid^="column-"]').first()).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await clearStorage(page);
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

test("shows login form when not authenticated", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Username")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
});

test("shows error for invalid credentials", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("does-not-exist");
  await page.getByLabel("Password").fill("wrongpass");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("alert")).toBeVisible();
});

test("can register and land on an empty board", async ({ page }) => {
  const username = uniqueUsername();
  await register(page, username);
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
  await expect(page.getByText(username)).toBeVisible();
});

test("logs out and returns to login form", async ({ page }) => {
  await register(page, uniqueUsername());
  await page.getByRole("button", { name: /sign out/i }).click();
  await expect(page.getByLabel("Username")).toBeVisible();
});

test("session persists across page reload", async ({ page }) => {
  await register(page, uniqueUsername());
  await page.reload();
  await expect(page.getByRole("heading", { name: "My Board" })).toBeVisible();
});

test("legacy seeded user still works", async ({ page }) => {
  await loginLegacyUser(page);
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

// ---------------------------------------------------------------------------
// Board CRUD and switching
// ---------------------------------------------------------------------------

test("can create and switch between boards", async ({ page }) => {
  await register(page, uniqueUsername());
  const sidebar = page.getByRole("complementary", { name: /board list/i });

  // Create a second board
  await sidebar.getByRole("button", { name: /new board/i }).click();
  await sidebar.getByLabel(/new board title/i).fill("Sprint 42");
  await sidebar.getByRole("button", { name: /^create$/i }).click();
  await expect(page.getByRole("heading", { name: "Sprint 42" })).toBeVisible();

  // Switch back to "My Board"
  await sidebar.getByText("My Board").click();
  await expect(page.getByRole("heading", { name: "My Board" })).toBeVisible();
});

test("created board is isolated from the default board", async ({ page }) => {
  await register(page, uniqueUsername());
  const sidebar = page.getByRole("complementary", { name: /board list/i });

  // Add a card to default board
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("On original board");
  await firstColumn.getByRole("button", { name: /^add card$/i }).click();
  await expect(firstColumn.getByText("On original board")).toBeVisible();

  // Create new board
  await sidebar.getByRole("button", { name: /new board/i }).click();
  await sidebar.getByLabel(/new board title/i).fill("Other");
  await sidebar.getByRole("button", { name: /^create$/i }).click();
  await expect(page.getByRole("heading", { name: "Other" })).toBeVisible();

  // Card from first board should not be here
  await expect(page.getByText("On original board")).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// Card operations
// ---------------------------------------------------------------------------

test("adds a card to a column", async ({ page }) => {
  await register(page, uniqueUsername());
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Playwright card");
  await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
  await firstColumn.getByRole("button", { name: /^add card$/i }).click();
  await expect(firstColumn.getByText("Playwright card")).toBeVisible();
});

test("cancel discards new card form without adding", async ({ page }) => {
  await register(page, uniqueUsername());
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  const initial = await firstColumn.locator('[data-testid^="card-"]').count();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Discarded card");
  await firstColumn.getByRole("button", { name: /cancel/i }).click();
  await expect(firstColumn.getByText("Discarded card")).not.toBeVisible();
  await expect(firstColumn.locator('[data-testid^="card-"]')).toHaveCount(initial);
});

test("renames a column", async ({ page }) => {
  await register(page, uniqueUsername());
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  const input = firstColumn.getByLabel("Column title");
  await input.click();
  await input.fill("Renamed Column");
  await input.blur();
  await expect(input).toHaveValue("Renamed Column");
});

test("opens card detail modal and updates priority", async ({ page }) => {
  await register(page, uniqueUsername());
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Metadata test");
  await firstColumn.getByRole("button", { name: /^add card$/i }).click();
  await expect(firstColumn.getByText("Metadata test")).toBeVisible();

  await firstColumn.getByRole("button", { name: /open metadata test/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/priority/i).selectOption("urgent");
  await dialog.getByLabel(/assignee/i).fill("alice");
  await dialog.getByRole("button", { name: /^save$/i }).click();
  await expect(dialog).not.toBeVisible();

  // Priority badge visible on the card
  await expect(firstColumn.getByLabelText(/priority urgent/i)).toBeVisible();
  await expect(firstColumn.getByText("@alice")).toBeVisible();
});

// ---------------------------------------------------------------------------
// AI chat
// ---------------------------------------------------------------------------

test("AI chat sidebar sends a message and shows a response", async ({ page }) => {
  await page.route("**/api/boards/*/ai/chat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        message: "I have added a card for you.",
        board: {
          id: 1,
          title: "My Board",
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

  await register(page, uniqueUsername());
  await page.getByRole("button", { name: /open ai chat/i }).click();
  const textarea = page.getByLabel("Chat message");
  await textarea.fill("Add a card please");
  await page.getByRole("button", { name: /send/i }).click();
  await expect(page.getByText("Add a card please")).toBeVisible();
  await expect(page.getByText("I have added a card for you.")).toBeVisible();
});
