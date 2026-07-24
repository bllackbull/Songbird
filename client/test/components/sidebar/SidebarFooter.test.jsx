/**
 * Badge tests for SidebarFooter — the bottom bar in the desktop sidebar
 * that shows the logged-in user's name and badges.
 *
 * The component is CSS-hidden on mobile (md:block), but the DOM is still
 * present at any viewport, so we test at both desktop and mobile widths.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import SidebarFooter from "../../../src/components/sidebar/footer/SidebarFooter.jsx";

function makeUser(overrides = {}) {
  return {
    id: 1,
    username: "alice",
    nickname: "Alice",
    avatarUrl: null,
    color: "#10b981",
    status: "online",
    role: "user",
    verified: false,
    ...overrides,
  };
}

const BASE_PROPS = {
  displayName: "Alice",
  displayInitials: "A",
  statusValue: "online",
  statusTextClass: "text-emerald-500",
  userColor: "#10b981",
  onOpenSettings: vi.fn(),
  onOpenOwnProfile: vi.fn(),
  settingsButtonRef: { current: null },
};

const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };

for (const [label, viewport] of [
  ["desktop", DESKTOP_VIEWPORT],
  ["mobile", MOBILE_VIEWPORT],
]) {
  describe(`SidebarFooter badge rendering — ${label} (${viewport.width}px)`, () => {
    beforeEach(async () => {
      await page.viewport(viewport.width, viewport.height);
    });

    describe("verified badge", () => {
      test("shows Verified badge when user.verified is true", async () => {
        render(
          <SidebarFooter {...BASE_PROPS} user={makeUser({ verified: true })} />,
        );
        await expect
          .element(page.getByLabelText("Verified"))
          .toBeInTheDocument();
      });

      test("shows Verified badge when user.verified is 1 (truthy integer from DB)", async () => {
        render(
          <SidebarFooter {...BASE_PROPS} user={makeUser({ verified: 1 })} />,
        );
        await expect
          .element(page.getByLabelText("Verified"))
          .toBeInTheDocument();
      });

      test("hides Verified badge when user.verified is false", async () => {
        render(
          <SidebarFooter
            {...BASE_PROPS}
            user={makeUser({ verified: false })}
          />,
        );
        await expect
          .element(page.getByLabelText("Verified"))
          .not.toBeInTheDocument();
      });

      test("hides Verified badge when user.verified is 0", async () => {
        render(
          <SidebarFooter {...BASE_PROPS} user={makeUser({ verified: 0 })} />,
        );
        await expect
          .element(page.getByLabelText("Verified"))
          .not.toBeInTheDocument();
      });

      test("hides Verified badge when user.verified is undefined", async () => {
        const user = makeUser();
        delete user.verified;
        render(<SidebarFooter {...BASE_PROPS} user={user} />);
        await expect
          .element(page.getByLabelText("Verified"))
          .not.toBeInTheDocument();
      });
    });

    describe("role badge", () => {
      test("shows 'Server Owner' badge when user.role='owner'", async () => {
        render(
          <SidebarFooter {...BASE_PROPS} user={makeUser({ role: "owner" })} />,
        );
        await expect
          .element(page.getByLabelText("Server Owner"))
          .toBeInTheDocument();
      });

      test("shows 'Server Admin' badge when user.role='admin'", async () => {
        render(
          <SidebarFooter {...BASE_PROPS} user={makeUser({ role: "admin" })} />,
        );
        await expect
          .element(page.getByLabelText("Server Admin"))
          .toBeInTheDocument();
      });

      test("shows no role badge when user.role='user'", async () => {
        render(
          <SidebarFooter {...BASE_PROPS} user={makeUser({ role: "user" })} />,
        );
        await expect
          .element(page.getByLabelText("Server Owner"))
          .not.toBeInTheDocument();
        await expect
          .element(page.getByLabelText("Server Admin"))
          .not.toBeInTheDocument();
      });

      test("shows no role badge when user.role is undefined", async () => {
        const user = makeUser();
        delete user.role;
        render(<SidebarFooter {...BASE_PROPS} user={user} />);
        await expect
          .element(page.getByLabelText("Server Owner"))
          .not.toBeInTheDocument();
        await expect
          .element(page.getByLabelText("Server Admin"))
          .not.toBeInTheDocument();
      });
    });

    describe("both badges together", () => {
      test("shows both Verified and Owner badge for a verified owner", async () => {
        render(
          <SidebarFooter
            {...BASE_PROPS}
            user={makeUser({ verified: true, role: "owner" })}
          />,
        );
        await expect
          .element(page.getByLabelText("Verified"))
          .toBeInTheDocument();
        await expect
          .element(page.getByLabelText("Server Owner"))
          .toBeInTheDocument();
      });

      test("shows both Verified and Admin badge for a verified admin", async () => {
        render(
          <SidebarFooter
            {...BASE_PROPS}
            user={makeUser({ verified: true, role: "admin" })}
          />,
        );
        await expect
          .element(page.getByLabelText("Verified"))
          .toBeInTheDocument();
        await expect
          .element(page.getByLabelText("Server Admin"))
          .toBeInTheDocument();
      });

      test("shows no badges for a plain unverified user", async () => {
        render(
          <SidebarFooter
            {...BASE_PROPS}
            user={makeUser({ verified: false, role: "user" })}
          />,
        );
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

    describe("badge order", () => {
      test("Verified badge appears before Owner badge in the DOM", async () => {
        render(
          <SidebarFooter
            {...BASE_PROPS}
            user={makeUser({ verified: true, role: "owner" })}
          />,
        );
        const verified = page.getByLabelText("Verified");
        const owner = page.getByLabelText("Server Owner");
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
        render(
          <SidebarFooter
            {...BASE_PROPS}
            user={makeUser({ verified: true, role: "admin" })}
          />,
        );
        const verified = page.getByLabelText("Verified");
        const admin = page.getByLabelText("Server Admin");
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

    describe("display name rendering", () => {
      test("renders the display name", async () => {
        render(<SidebarFooter {...BASE_PROPS} user={makeUser()} />);
        await expect.element(page.getByText("Alice")).toBeInTheDocument();
      });
    });
  });
}
