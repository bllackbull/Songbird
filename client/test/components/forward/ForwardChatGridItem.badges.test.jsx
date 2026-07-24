/**
 * Badge tests for ForwardChatGridItem — the grid cell shown in the forward
 * modal for each chat the user can forward a message to.
 *
 * Tests run at desktop (1280×800) and mobile (390×844) viewport sizes.
 * ForwardChatGridItem is a pure display component: it shows a badge only
 * when the `verified` or `role` prop is passed.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import ForwardChatGridItem from "../../../src/components/forward/ForwardChatGridItem.jsx";

const BASE_ITEM = {
  title: "Alice",
  avatarUrl: null,
  color: "#3b82f6",
  kind: "dm",
  initialsSource: "Alice",
  showOnlineBadge: false,
  verified: false,
  role: null,
  selected: false,
  onClick: vi.fn(),
};

const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };

for (const [label, viewport] of [
  ["desktop", DESKTOP_VIEWPORT],
  ["mobile", MOBILE_VIEWPORT],
]) {
  describe(`ForwardChatGridItem — ${label} (${viewport.width}px)`, () => {
    beforeEach(async () => {
      await page.viewport(viewport.width, viewport.height);
    });

    describe("DM peer badges", () => {
      test("shows Verified badge for a verified DM peer", async () => {
        render(
          <ForwardChatGridItem {...BASE_ITEM} kind="dm" verified={true} />,
        );
        await expect
          .element(page.getByLabelText("Verified"))
          .toBeInTheDocument();
      });

      test("hides Verified badge for unverified DM peer", async () => {
        render(
          <ForwardChatGridItem {...BASE_ITEM} kind="dm" verified={false} />,
        );
        await expect.element(page.getByText("Alice")).toBeInTheDocument();
        await expect
          .element(page.getByLabelText("Verified"))
          .not.toBeInTheDocument();
      });

      test("shows Owner badge for DM peer with role='owner'", async () => {
        render(<ForwardChatGridItem {...BASE_ITEM} kind="dm" role="owner" />);
        await expect
          .element(page.getByLabelText("Server Owner"))
          .toBeInTheDocument();
      });

      test("shows Admin badge for DM peer with role='admin'", async () => {
        render(<ForwardChatGridItem {...BASE_ITEM} kind="dm" role="admin" />);
        await expect
          .element(page.getByLabelText("Server Admin"))
          .toBeInTheDocument();
      });

      test("shows no role badge for plain DM peer", async () => {
        render(<ForwardChatGridItem {...BASE_ITEM} kind="dm" role={null} />);
        await expect.element(page.getByText("Alice")).toBeInTheDocument();
        await expect
          .element(page.getByLabelText("Server Owner"))
          .not.toBeInTheDocument();
        await expect
          .element(page.getByLabelText("Server Admin"))
          .not.toBeInTheDocument();
      });

      test("shows both Verified and Admin badges for verified admin DM peer", async () => {
        render(
          <ForwardChatGridItem
            {...BASE_ITEM}
            kind="dm"
            verified={true}
            role="admin"
          />,
        );
        await expect
          .element(page.getByLabelText("Verified"))
          .toBeInTheDocument();
        await expect
          .element(page.getByLabelText("Server Admin"))
          .toBeInTheDocument();
      });

      test("shows no badges for plain unverified DM peer", async () => {
        render(
          <ForwardChatGridItem
            {...BASE_ITEM}
            kind="dm"
            verified={false}
            role={null}
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

      test("Verified badge appears before role badge in DOM", async () => {
        render(
          <ForwardChatGridItem
            {...BASE_ITEM}
            kind="dm"
            verified={true}
            role="owner"
          />,
        );
        const verified = page.getByLabelText("Verified");
        const owner = page.getByLabelText("Server Owner");
        await expect.element(verified).toBeInTheDocument();
        await expect.element(owner).toBeInTheDocument();
        const verifiedEl = await verified.element();
        const ownerEl = await owner.element();
        expect(
          verifiedEl.compareDocumentPosition(ownerEl) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
      });
    });

    describe("group/channel chat badges", () => {
      test("shows Verified badge for a verified group", async () => {
        render(
          <ForwardChatGridItem
            {...BASE_ITEM}
            kind="group"
            title="Dev Team"
            verified={true}
          />,
        );
        await expect
          .element(page.getByLabelText("Verified"))
          .toBeInTheDocument();
      });

      test("hides Verified badge for unverified group", async () => {
        render(
          <ForwardChatGridItem
            {...BASE_ITEM}
            kind="group"
            title="Dev Team"
            verified={false}
          />,
        );
        await expect.element(page.getByText("Dev Team")).toBeInTheDocument();
        await expect
          .element(page.getByLabelText("Verified"))
          .not.toBeInTheDocument();
      });

      test("shows Verified badge for a verified channel", async () => {
        render(
          <ForwardChatGridItem
            {...BASE_ITEM}
            kind="channel"
            title="News"
            verified={true}
          />,
        );
        await expect
          .element(page.getByLabelText("Verified"))
          .toBeInTheDocument();
      });

      test("does NOT show role badge for group (groups have no server role)", async () => {
        render(
          <ForwardChatGridItem
            {...BASE_ITEM}
            kind="group"
            title="Dev Team"
            verified={true}
            role="owner"
          />,
        );
        await expect
          .element(page.getByLabelText("Verified"))
          .toBeInTheDocument();
        // role badge is only shown for kind="dm"
        await expect
          .element(page.getByLabelText("Server Owner"))
          .not.toBeInTheDocument();
      });
    });
  });
}
