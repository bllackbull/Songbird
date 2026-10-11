import { describe, test, expect, vi, afterEach } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import InvitePage from "../../../src/pages/InvitePage.jsx";

function inviteResponse(group) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve({ group, alreadyMember: false }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("InvitePage verified badge", () => {
  test("shows a badge for a verified invited chat", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        inviteResponse({
          id: 12,
          name: "Verified Group",
          type: "group",
          username: "verified_group",
          color: "#10b981",
          avatarUrl: "",
          membersCount: 3,
          verified: true,
        }),
      ),
    );

    render(
      <InvitePage
        token="invite-token"
        user={{ username: "alice" }}
        isDark={false}
        onToggleTheme={vi.fn()}
        onNavigateChat={vi.fn()}
        onRequireLogin={vi.fn()}
      />,
    );

    await expect.element(page.getByText("Verified Group").first()).toBeInTheDocument();
    await expect.element(page.getByLabelText("Verified")).toBeInTheDocument();
  });
});
