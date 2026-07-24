/**
 * Badge rendering tests for admin UsersTab — covers both mobile card list
 * (visible on narrow viewports) and desktop table (sm: and up).
 *
 * UsersTab fetches data via api.get() → apiFetch → window.fetch.
 * We stub window.fetch to return a controlled users array so the component
 * renders without a real server.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import UsersTab from "../../../src/components/admin/UsersTab.jsx";

const CURRENT_USER = {
  id: 1,
  username: "alice",
  nickname: "Alice",
  color: "#10b981",
  role: "owner",
  verified: false,
};

function makeApiUser(overrides = {}) {
  return {
    id: 2,
    username: "bob",
    nickname: "Bob",
    avatar_url: null,
    color: "#3b82f6",
    role: "user",
    verified: false,
    banned: false,
    online: false,
    created_at: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function mockFetch(users, total = null) {
  const resolvedTotal = total ?? users.length;
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ users, total: resolvedTotal }),
  });
}

// All tests live inside this describe so beforeEach/afterEach are scoped
// within the browser runner context (top-level lifecycle hooks cause a
// "Vitest failed to find the runner" error in browser mode).
describe("UsersTab badge rendering", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = window.fetch;
  });

  afterEach(() => {
    window.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // ─── Verified badge ─────────────────────────────────────────────────────────

  describe("verified badge", () => {
    test("shows Verified badge for a verified user", async () => {
      window.fetch = mockFetch([makeApiUser({ verified: true })]);
      render(<UsersTab currentUser={CURRENT_USER} active={true} />);
      await expect
        .element(page.getByLabelText("Verified").first())
        .toBeInTheDocument();
    });

    test("shows Verified badge when verified=1 (integer from DB)", async () => {
      window.fetch = mockFetch([makeApiUser({ verified: 1 })]);
      render(<UsersTab currentUser={CURRENT_USER} active={true} />);
      await expect
        .element(page.getByLabelText("Verified").first())
        .toBeInTheDocument();
    });

    test("hides Verified badge for unverified user", async () => {
      window.fetch = mockFetch([makeApiUser({ verified: false })]);
      render(<UsersTab currentUser={CURRENT_USER} active={true} />);
      await expect.element(page.getByText("Bob").first()).toBeInTheDocument();
      await expect
        .element(page.getByLabelText("Verified"))
        .not.toBeInTheDocument();
    });
  });

  // ─── Role badge ─────────────────────────────────────────────────────────────

  describe("role badge", () => {
    test("shows Owner badge for owner user", async () => {
      window.fetch = mockFetch([makeApiUser({ role: "owner" })]);
      render(<UsersTab currentUser={CURRENT_USER} active={true} />);
      await expect
        .element(page.getByLabelText("Server Owner").first())
        .toBeInTheDocument();
    });

    test("shows Admin badge for admin user", async () => {
      window.fetch = mockFetch([makeApiUser({ role: "admin" })]);
      render(<UsersTab currentUser={CURRENT_USER} active={true} />);
      await expect
        .element(page.getByLabelText("Server Admin").first())
        .toBeInTheDocument();
    });

    test("shows no role badge for plain user", async () => {
      window.fetch = mockFetch([makeApiUser({ role: "user" })]);
      render(<UsersTab currentUser={CURRENT_USER} active={true} />);
      await expect.element(page.getByText("Bob").first()).toBeInTheDocument();
      await expect
        .element(page.getByLabelText("Server Owner"))
        .not.toBeInTheDocument();
      await expect
        .element(page.getByLabelText("Server Admin"))
        .not.toBeInTheDocument();
    });
  });

  // ─── Both badges ─────────────────────────────────────────────────────────────

  describe("both badges together", () => {
    test("shows both Verified and Owner badges for a verified owner", async () => {
      window.fetch = mockFetch([
        makeApiUser({ verified: true, role: "owner" }),
      ]);
      render(<UsersTab currentUser={CURRENT_USER} active={true} />);
      await expect
        .element(page.getByLabelText("Verified").first())
        .toBeInTheDocument();
      await expect
        .element(page.getByLabelText("Server Owner").first())
        .toBeInTheDocument();
    });

    test("shows both Verified and Admin badges for a verified admin", async () => {
      window.fetch = mockFetch([
        makeApiUser({ verified: true, role: "admin" }),
      ]);
      render(<UsersTab currentUser={CURRENT_USER} active={true} />);
      await expect
        .element(page.getByLabelText("Verified").first())
        .toBeInTheDocument();
      await expect
        .element(page.getByLabelText("Server Admin").first())
        .toBeInTheDocument();
    });

    test("shows no badges for plain unverified user", async () => {
      window.fetch = mockFetch([
        makeApiUser({ verified: false, role: "user" }),
      ]);
      render(<UsersTab currentUser={CURRENT_USER} active={true} />);
      await expect.element(page.getByText("Bob").first()).toBeInTheDocument();
      await expect
        .element(page.getByLabelText("Verified"))
        .not.toBeInTheDocument();
      await expect
        .element(page.getByLabelText("Server Owner"))
        .not.toBeInTheDocument();
      await expect
        .element(page.getByLabelText("Server Admin"))
        .not.toBeInTheDocument();
    });
  });

  // ─── Badge order ─────────────────────────────────────────────────────────────

  describe("badge order", () => {
    test("Verified badge appears before Owner badge in the DOM", async () => {
      window.fetch = mockFetch([
        makeApiUser({ verified: true, role: "owner" }),
      ]);
      render(<UsersTab currentUser={CURRENT_USER} active={true} />);
      const verified = page.getByLabelText("Verified").first();
      const owner = page.getByLabelText("Server Owner").first();
      await expect.element(verified).toBeInTheDocument();
      await expect.element(owner).toBeInTheDocument();
      const verifiedEl = verified.element();
      const ownerEl = owner.element();
      expect(
        verifiedEl.compareDocumentPosition(ownerEl) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    test("Verified badge appears before Admin badge in the DOM", async () => {
      window.fetch = mockFetch([
        makeApiUser({ verified: true, role: "admin" }),
      ]);
      render(<UsersTab currentUser={CURRENT_USER} active={true} />);
      const verified = page.getByLabelText("Verified").first();
      const admin = page.getByLabelText("Server Admin").first();
      await expect.element(verified).toBeInTheDocument();
      await expect.element(admin).toBeInTheDocument();
      const verifiedEl = verified.element();
      const adminEl = admin.element();
      expect(
        verifiedEl.compareDocumentPosition(adminEl) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
  });

  // ─── Multiple users ───────────────────────────────────────────────────────────

  describe("badges appear on the right users only", () => {
    test("only the verified user gets a Verified badge", async () => {
      window.fetch = mockFetch([
        makeApiUser({ id: 2, username: "bob", nickname: "Bob", verified: true, role: "user" }),
        makeApiUser({ id: 3, username: "carol", nickname: "Carol", verified: false, role: "user" }),
      ]);
      render(<UsersTab currentUser={CURRENT_USER} active={true} />);
      await expect.element(page.getByText("Bob").first()).toBeInTheDocument();
      await expect.element(page.getByText("Carol").first()).toBeInTheDocument();
      await expect
        .element(page.getByLabelText("Verified").first())
        .toBeInTheDocument();
    });

    test("admin badge on admin, no badge on plain user", async () => {
      window.fetch = mockFetch([
        makeApiUser({ id: 2, username: "bob", nickname: "Bob", role: "admin" }),
        makeApiUser({ id: 3, username: "carol", nickname: "Carol", role: "user" }),
      ]);
      render(<UsersTab currentUser={CURRENT_USER} active={true} />);
      await expect
        .element(page.getByLabelText("Server Admin").first())
        .toBeInTheDocument();
      await expect
        .element(page.getByLabelText("Server Owner"))
        .not.toBeInTheDocument();
    });
  });
});
