/**
 * Badge tests for MobileSettingsPanel — the user profile card shown at the
 * top of the mobile settings menu (the md:hidden panel).
 *
 * Tests run at both mobile (390×844) and desktop (1280×800) viewport sizes.
 * At desktop the component wrapper is hidden via CSS (md:hidden) but the DOM
 * is still present — badges must render correctly either way.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { MobileSettingsPanel } from "../../../src/components/settings/panels/MobileSettingsPanel.jsx";

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
  settingsPanel: null,
  displayName: "Alice",
  statusTextClass: "text-emerald-500",
  statusValue: "online",
  setSettingsPanel: vi.fn(),
  toggleTheme: vi.fn(),
  setIsDark: vi.fn(),
  isDark: false,
  handleLogout: vi.fn(),
  handleProfileSave: vi.fn(),
  avatarPreview: null,
  profileForm: { nickname: "Alice", username: "alice" },
  handleAvatarChange: vi.fn(),
  handleAvatarRemove: vi.fn(),
  setProfileForm: vi.fn(),
  statusSelection: "online",
  setStatusSelection: vi.fn(),
  handlePasswordSave: vi.fn(),
  passwordForm: { currentPassword: "", newPassword: "", confirmPassword: "" },
  setPasswordForm: vi.fn(),
  userColor: "#10b981",
  profileError: null,
  passwordError: null,
  fileUploadEnabled: false,
  notificationsSupported: false,
  notificationPermission: "default",
  notificationsEnabled: false,
  onToggleNotifications: vi.fn(),
  messagePreviewEnabled: false,
  onToggleMessagePreview: vi.fn(),
  onClearCache: vi.fn(),
  dataCacheStats: null,
  onOpenOwnProfile: vi.fn(),
  onOpenSavedMessages: vi.fn(),
  appInfo: null,
  appInfoLoading: false,
  appInfoError: null,
  onOpenWhatsNew: vi.fn(),
  adminPanelEnabled: false,
};

const MOBILE_VIEWPORT = { width: 390, height: 844 };
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };

for (const [label, viewport] of [
  ["mobile", MOBILE_VIEWPORT],
  ["desktop", DESKTOP_VIEWPORT],
]) {
  describe(`MobileSettingsPanel user profile badges — ${label} (${viewport.width}px)`, () => {
    beforeEach(async () => {
      await page.viewport(viewport.width, viewport.height);
    });

    describe("verified badge", () => {
      test("shows Verified badge when user.verified is true", async () => {
        render(
          <MobileSettingsPanel
            {...BASE_PROPS}
            user={makeUser({ verified: true })}
          />,
        );
        await expect
          .element(page.getByLabelText("Verified"))
          .toBeInTheDocument();
      });

      test("shows Verified badge when user.verified is 1 (integer from DB)", async () => {
        render(
          <MobileSettingsPanel
            {...BASE_PROPS}
            user={makeUser({ verified: 1 })}
          />,
        );
        await expect
          .element(page.getByLabelText("Verified"))
          .toBeInTheDocument();
      });

      test("hides Verified badge when user.verified is false", async () => {
        render(
          <MobileSettingsPanel
            {...BASE_PROPS}
            user={makeUser({ verified: false })}
          />,
        );
        await expect.element(page.getByText("Alice")).toBeInTheDocument();
        await expect
          .element(page.getByLabelText("Verified"))
          .not.toBeInTheDocument();
      });

      test("hides Verified badge when user.verified is 0", async () => {
        render(
          <MobileSettingsPanel
            {...BASE_PROPS}
            user={makeUser({ verified: 0 })}
          />,
        );
        await expect.element(page.getByText("Alice")).toBeInTheDocument();
        await expect
          .element(page.getByLabelText("Verified"))
          .not.toBeInTheDocument();
      });
    });

    describe("role badge", () => {
      test("shows Owner badge when user.role='owner'", async () => {
        render(
          <MobileSettingsPanel
            {...BASE_PROPS}
            user={makeUser({ role: "owner" })}
          />,
        );
        await expect
          .element(page.getByLabelText("Server Owner"))
          .toBeInTheDocument();
      });

      test("shows Admin badge when user.role='admin'", async () => {
        render(
          <MobileSettingsPanel
            {...BASE_PROPS}
            user={makeUser({ role: "admin" })}
          />,
        );
        await expect
          .element(page.getByLabelText("Server Admin"))
          .toBeInTheDocument();
      });

      test("shows no role badge when user.role='user'", async () => {
        render(
          <MobileSettingsPanel
            {...BASE_PROPS}
            user={makeUser({ role: "user" })}
          />,
        );
        await expect.element(page.getByText("Alice")).toBeInTheDocument();
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
          <MobileSettingsPanel
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
          <MobileSettingsPanel
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
          <MobileSettingsPanel
            {...BASE_PROPS}
            user={makeUser({ verified: false, role: "user" })}
          />,
        );
        await expect.element(page.getByText("Alice")).toBeInTheDocument();
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
          <MobileSettingsPanel
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
          <MobileSettingsPanel
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
  });
}
