/**
 * Badge rendering tests for admin ChatsTab — covers both mobile card list
 * and desktop table view. ChatsTab only shows a verified badge for chats
 * (no UserRoleBadge — chats don't have server roles).
 */
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import ChatsTab from "../../../src/components/admin/ChatsTab.jsx";

function makeApiChat(overrides = {}) {
  return {
    id: 1,
    name: "Test Group",
    type: "group",
    group_username: "test_group",
    group_color: "#10b981",
    group_avatar_url: null,
    group_visibility: "public",
    verified: false,
    member_count: 3,
    message_count: 10,
    created_at: "2024-01-01T00:00:00.000Z",
    owner_id: 1,
    owner_username: "alice",
    owner_nickname: "Alice",
    owner_avatar_url: null,
    owner_color: "#10b981",
    ...overrides,
  };
}

function mockFetch(chats, total = null) {
  const resolvedTotal = total ?? chats.length;
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ chats, total: resolvedTotal }),
  });
}

let originalFetch;
beforeEach(() => {
  originalFetch = window.fetch;
});
afterEach(() => {
  window.fetch = originalFetch;
  vi.restoreAllMocks();
});

// ─── Verified badge ───────────────────────────────────────────────────────────

describe("ChatsTab — verified badge", () => {
  test("shows Verified badge for a verified group", async () => {
    window.fetch = mockFetch([makeApiChat({ verified: true })]);
    render(<ChatsTab active={true} />);
    await expect
      .element(page.getByLabelText("Verified").first())
      .toBeInTheDocument();
  });

  test("shows Verified badge when verified=1 (integer from DB)", async () => {
    window.fetch = mockFetch([makeApiChat({ verified: 1 })]);
    render(<ChatsTab active={true} />);
    await expect
      .element(page.getByLabelText("Verified").first())
      .toBeInTheDocument();
  });

  test("hides Verified badge for unverified group", async () => {
    window.fetch = mockFetch([makeApiChat({ verified: false })]);
    render(<ChatsTab active={true} />);
    await expect
      .element(page.getByText("Test Group").first())
      .toBeInTheDocument();
    await expect
      .element(page.getByLabelText("Verified"))
      .not.toBeInTheDocument();
  });

  test("shows Verified badge for a verified channel", async () => {
    window.fetch = mockFetch([
      makeApiChat({ type: "channel", name: "My Channel", verified: true }),
    ]);
    render(<ChatsTab active={true} />);
    await expect
      .element(page.getByLabelText("Verified").first())
      .toBeInTheDocument();
  });

  test("hides Verified badge for unverified channel", async () => {
    window.fetch = mockFetch([
      makeApiChat({ type: "channel", name: "My Channel", verified: false }),
    ]);
    render(<ChatsTab active={true} />);
    await expect
      .element(page.getByText("My Channel").first())
      .toBeInTheDocument();
    await expect
      .element(page.getByLabelText("Verified"))
      .not.toBeInTheDocument();
  });
});

// ─── No role badge for chats ──────────────────────────────────────────────────

describe("ChatsTab — no role badges for chats", () => {
  test("never shows Server Owner badge even for a verified chat", async () => {
    window.fetch = mockFetch([makeApiChat({ verified: true })]);
    render(<ChatsTab active={true} />);
    await expect
      .element(page.getByLabelText("Verified").first())
      .toBeInTheDocument();
    await expect
      .element(page.getByLabelText("Server Owner"))
      .not.toBeInTheDocument();
    await expect
      .element(page.getByLabelText("Server Admin"))
      .not.toBeInTheDocument();
  });
});

// ─── Multiple chats — badge on the right chat only ───────────────────────────

describe("ChatsTab — verified badge only on verified chats", () => {
  test("only verified chat gets the badge, unverified does not", async () => {
    window.fetch = mockFetch([
      makeApiChat({
        id: 1,
        name: "Verified Group",
        group_username: "verified_group",
        verified: true,
      }),
      makeApiChat({
        id: 2,
        name: "Regular Group",
        group_username: "regular_group",
        verified: false,
      }),
    ]);
    render(<ChatsTab active={true} />);
    // Both chat names should appear
    await expect
      .element(page.getByText("Verified Group").first())
      .toBeInTheDocument();
    await expect
      .element(page.getByText("Regular Group").first())
      .toBeInTheDocument();
    // At least one Verified badge exists (on the verified chat)
    await expect
      .element(page.getByLabelText("Verified").first())
      .toBeInTheDocument();
  });
});
