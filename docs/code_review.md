# Code Review — Kanban Studio MVP

**Date:** 2026-04-06  
**Scope:** Full repository — backend, frontend, tests, infrastructure

---

## Summary

The codebase is clean and well-structured for an MVP. The stack choices are sound, the test coverage is good, and the code is readable. There are a small number of genuine bugs, a few dead-code remnants from the frontend-only era, and some important gaps in error handling and API security that are worth addressing before any wider use.

---

## Bugs

### 1. `chat_structured` missing `response_format` (backend, critical)

**File:** `backend/ai.py:64-72`

`chat_structured` calls the OpenRouter API without passing `response_format={"type": "json_object"}`. Without this, the model is not guaranteed to return valid JSON, making `AIResponse.model_validate_json(content)` unreliable in production — it will raise `ValidationError` whenever the model wraps its response in prose.

The test `test_chat_structured_uses_json_object_format` in `backend/tests/test_ai.py:76-80` already asserts this parameter is present, so the test will currently **fail**. Fix:

```python
response = openai_client.chat.completions.create(
    model=MODEL,
    messages=messages,
    response_format={"type": "json_object"},
)
```

---

### 2. E2e drag test references stale string IDs (frontend, high)

**File:** `frontend/tests/kanban.spec.ts:101-110`

The drag test uses `page.getByTestId("card-card-1")` and `page.getByTestId("column-col-review")`. These are the old frontend-only string IDs from `initialData`. The live backend returns integer IDs from SQLite (e.g., `"1"`, `"2"`), which produce `data-testid="card-1"` and `data-testid="column-1"`. The test will never find these elements against a running backend and will fail or pass only by coincidence.

The test should either query by visible text (column title, card title) rather than test IDs, or the test IDs need to be stable names agreed with the backend.

---

### 3. `seed()` hardcodes `user_id = 1` (backend, low)

**File:** `backend/database.py:79`

```python
conn.execute("INSERT INTO boards (user_id, title) VALUES (1, 'My Board')")
```

The user's actual `lastrowid` is not used. If the `AUTOINCREMENT` sequence ever starts elsewhere (e.g., in a migrated database), the board would be assigned to the wrong user. Fix:

```python
cursor = conn.execute("INSERT INTO users (username, password_hash) VALUES (?, ?)", (...))
conn.execute("INSERT INTO boards (user_id, title) VALUES (?, 'My Board')", (cursor.lastrowid,))
```

---

## Security

### 4. Credentials checked in the browser (frontend, known limitation)

**File:** `frontend/src/lib/auth.ts:3-4`

The `checkCredentials` function compares against the literal strings `"user"` and `"password"` in client-side JavaScript. Anyone who inspects the bundle will see the credentials immediately. For this MVP this is intentional, but it means the login form is purely cosmetic — it provides no real access control. The backend APIs are also unauthenticated (see below), so this is not an isolated gap.

**Action:** No change needed for the MVP. Document this explicitly in `AGENTS.md` so future contributors understand it.

---

### 5. Backend API has no authentication (backend, high for any non-local deployment)

**File:** `backend/main.py` — all routes

Every API endpoint (`/api/board`, `/api/cards`, `/api/ai/chat`, etc.) is accessible without any token or session cookie. `MVP_USER_ID = 1` is hardcoded. Anyone who can reach port 8000 can read and modify all board data and trigger AI calls (at the owner's API cost).

For a local Docker container this is acceptable, but it must be addressed before any network exposure. The database schema already supports multi-user, so the plumbing is there.

**Action:** Document this in `AGENTS.md` as a known gap. Add a note to the README that the container must not be exposed beyond localhost.

---

## Dead Code

### 6. `initialData` is unused in production (frontend)

**File:** `frontend/src/lib/kanban.ts:18-72`

`initialData` is a hardcoded board snapshot from the frontend-only era. It is only referenced in unit test mocks. It is not used anywhere in the production code path. The same applies to `createId` (line 164-168), which generates string IDs but the app exclusively uses integer IDs from the backend.

**Action:** Remove `initialData` and `createId` from `kanban.ts`. Update test mocks that reference `initialData` to define the fixture locally within the test file.

---

## Silent Failures / Error Handling

### 7. API errors swallowed silently in the UI (frontend, medium)

**Files:** `frontend/src/components/KanbanBoard.tsx:60`, `:78`, `:118`

`moveCard`, `renameColumn`, and `deleteCard` all use `.catch(console.error)`. If the API call fails, the UI shows the change (optimistic update) but the database is not updated. The user sees incorrect state with no feedback. This can lead to silent data loss on, for example, a flaky connection.

**Action:** At minimum, display a toast or revert the optimistic update on error. The AI chat sidebar (`AIChatSidebar.tsx:38-42`) already shows an error message on failure — the same pattern should be applied here.

---

### 8. Board load failure shows a blank page forever (frontend, medium)

**File:** `frontend/src/components/KanbanBoard.tsx:121`

`if (!board) return null` is used both as a loading state and as an error state. If `fetchBoard()` rejects, `board` stays `null` and the user sees an empty page with no way to recover without a page refresh.

**Action:** Track a separate `error` state and show a message when `fetchBoard` fails.

---

## Test Coverage Gaps

### 9. No e2e test for the AI chat sidebar

**File:** `frontend/tests/kanban.spec.ts`

All 11 e2e tests cover auth and board CRUD. None test the AI chat sidebar. Given that the AI path involves an external API call and mutates the board, it warrants at least one smoke test (mocked at the network layer with Playwright's `page.route`).

---

### 10. `_apply_board_update` AI actions are not validated against board ownership (backend)

**File:** `backend/main.py:223-251`

`_apply_board_update` processes AI-supplied `column_id` and `card_id` values without verifying they belong to the current user's board. Currently this cannot be exploited (single hardcoded user), but it is an inconsistency with how the manual CRUD routes use `_require_column` and `_require_card`. If multi-user support is added later, this would be a serious IDOR vulnerability.

**Action:** Add ownership checks inside `_apply_board_update`, or validate the AI output before applying it.

---

### 11. No test for `fetchBoard` failure in `KanbanBoard` (frontend)

**File:** `frontend/src/components/KanbanBoard.test.tsx`

All unit tests assume `fetchBoard` resolves. There is no test for what happens when it rejects. Once the blank-page bug (item 8) is fixed, add a test to confirm the error state is rendered.

---

## Minor Issues

### 12. `pydantic` not explicit in `pyproject.toml` (backend, low)

**File:** `backend/pyproject.toml`

Pydantic is used extensively (`BaseModel`, `Field`) in both `main.py` and `ai.py` but is not listed as a direct dependency — it arrives transitively via FastAPI. This is fragile: a FastAPI version bump could in theory change which Pydantic version is pulled in. Add `pydantic>=2.0` explicitly.

---

### 13. CSS variable name mismatch in documentation (low)

**File:** `CLAUDE.md` (docs)

`CLAUDE.md` lists `--purple-secondary: #753991` but the actual CSS (`globals.css:8`) and all components use `--secondary-purple`. This is a documentation-only error but will cause confusion for anyone trying to use the documented variable names.

---

### 14. `NewCardForm` inputs lack accessible labels (frontend, low)

**File:** `frontend/src/components/NewCardForm.tsx:37, 41`

The title input and details textarea use `placeholder` as their only label. Placeholders disappear once the user starts typing and are not reliably announced by screen readers. Add `<label>` elements or `aria-label` attributes.

---

### 15. `KanbanColumn` rename commits on every blur (UX)

**File:** `frontend/src/components/KanbanColumn.tsx:47`

Every time the column title input loses focus, `onRenameCommit` fires and makes a PATCH API call — even if the value has not changed. This is harmless but makes unnecessary network requests. A check `if (event.target.value !== column.title)` before committing would eliminate the noise.

---

## Infrastructure

### 16. No `.env.example` file

There is no `.env.example` documenting that `OPENROUTER_API_KEY` is required. A new developer cloning the repo would need to find this in `backend/ai.py`. Add a `.env.example` with the key name and a placeholder value.

---

## Prioritised Action List

| Priority | Item | File(s) |
|----------|------|---------|
| Fix now | Bug: missing `response_format` in `chat_structured` | `backend/ai.py:65` |
| Fix now | Bug: e2e drag test uses stale hardcoded IDs | `frontend/tests/kanban.spec.ts:101` |
| Fix now | Bug: `seed()` uses hardcoded `user_id=1` | `backend/database.py:79` |
| High | Silent API failures give no user feedback | `frontend/src/components/KanbanBoard.tsx` |
| High | Board load failure shows blank page | `frontend/src/components/KanbanBoard.tsx:121` |
| High | Document that backend has no auth (non-localhost risk) | `AGENTS.md` |
| Medium | Remove dead code: `initialData`, `createId` | `frontend/src/lib/kanban.ts` |
| Medium | Add `_apply_board_update` ownership validation | `backend/main.py:223` |
| Medium | Add e2e test for AI chat sidebar | `frontend/tests/kanban.spec.ts` |
| Low | Add `pydantic` to `pyproject.toml` | `backend/pyproject.toml` |
| Low | Add `.env.example` | project root |
| Low | Fix CSS variable name in CLAUDE.md | `CLAUDE.md` |
| Low | Add labels to `NewCardForm` inputs | `frontend/src/components/NewCardForm.tsx` |
| Low | Skip rename commit if value unchanged | `frontend/src/components/KanbanColumn.tsx:47` |
