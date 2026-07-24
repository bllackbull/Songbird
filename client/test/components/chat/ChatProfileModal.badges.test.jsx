/**
 * Badge rendering tests for ChatProfileModal.
 *
 * Covers:
 *   - Profile header badges (user DM context)
 *   - Profile header badges (group/channel context)
 *   - Member list row badges
 *   - Badge order and exclusivity
 */
import { describe, test, expect, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import ChatProfileModal from "../../../src/components/modals/ChatProfileModal.jsx";

const CURRENT_USER = {
  id: 1,
  username: "alice",
  nickname: "Alice",
  avatar_url: null,
  color: "#10b981",
  role: "user",
  verified: false,
};

// Minimal DM chat object (type="dm" forces user profile view)
function makeDmChat(overrides = {}) {
  return { id: 10, type: "dm", verified: false, members: [], ...overrides };
}

// Minimal group chat object
function makeGroupChat(overrides = {}) {
  return {
    id: 20,
    type: "group",
    name: "Test Group",
    group_username: "test_group",
    group_color: "#10b981",
    group_avatar_url: null,
    verified: false,
    members: [],
    membersCount: 0,
    ...overrides,
  };
}

// Target user (the peer in a DM or an inspected member)
function makeTargetUser(overrides = {}) {
  return {
    id: 2,
    username: "bob",
    nickname: "Bob",
    avatar_url: null,
    color: "#3b82f6",
    role: "user",
    verified: false,
    ...overrides,
  };
}

// Member row shape (from listChatMembers — uses user_verified / user_role)
function makeMember(overrides = {}) {
  return {
    id: 3,
    username: "carol",
    nickname: "Carol",
    avatar_url: null,
    color: "#f59e0b",
    status: "offline",
    role: "member", // chat-level role
    user_role: "user", // server-level role
    user_verified: 0,
    ...overrides,
  };
}

const BASE_MODAL_PROPS = {
  open: true,
  currentUser: CURRENT_USER,
  muted: false,
  inviteLink: "",
  inviteLinkLoading: false,
  canViewInvite: false,
  onClose: vi.fn(),
  onOpenChat: vi.fn(),
  onToggleMute: vi.fn(),
  showMembers: false, // keep it focused; member tests enable it
  readOnly: true,
};

// ─── Profile header — DM / user profile ──────────────────────────────────────

describe("ChatProfileModal — user profile header badges", () => {
  test("shows Verified badge for verified user", async () => {
    render(
      <ChatProfileModal
        {...BASE_MODAL_PROPS}
        chat={makeDmChat()}
        targetUser={makeTargetUser({ verified: true })}
      />,
    );
    await expect.element(page.getByLabelText("Verified")).toBeInTheDocument();
  });

  test("shows Verified badge when targetUser.user_verified is truthy (alias)", async () => {
    render(
      <ChatProfileModal
        {...BASE_MODAL_PROPS}
        chat={makeDmChat()}
        targetUser={makeTargetUser({ verified: undefined, user_verified: 1 })}
      />,
    );
    await expect.element(page.getByLabelText("Verified")).toBeInTheDocument();
  });

  test("hides Verified badge for unverified user", async () => {
    render(
      <ChatProfileModal
        {...BASE_MODAL_PROPS}
        chat={makeDmChat()}
        targetUser={makeTargetUser({ verified: false })}
      />,
    );
    await expect
      .element(page.getByLabelText("Verified"))
      .not.toBeInTheDocument();
  });

  test("shows Owner badge for owner user", async () => {
    render(
      <ChatProfileModal
        {...BASE_MODAL_PROPS}
        chat={makeDmChat()}
        targetUser={makeTargetUser({ role: "owner" })}
      />,
    );
    await expect
      .element(page.getByLabelText("Server Owner"))
      .toBeInTheDocument();
  });

  test("shows Admin badge for admin user", async () => {
    render(
      <ChatProfileModal
        {...BASE_MODAL_PROPS}
        chat={makeDmChat()}
        targetUser={makeTargetUser({ role: "admin" })}
      />,
    );
    await expect
      .element(page.getByLabelText("Server Admin"))
      .toBeInTheDocument();
  });

  test("shows Owner badge via user_role alias", async () => {
    render(
      <ChatProfileModal
        {...BASE_MODAL_PROPS}
        chat={makeDmChat()}
        targetUser={makeTargetUser({ role: undefined, user_role: "owner" })}
      />,
    );
    await expect
      .element(page.getByLabelText("Server Owner"))
      .toBeInTheDocument();
  });

  test("shows no role badge for plain user", async () => {
    render(
      <ChatProfileModal
        {...BASE_MODAL_PROPS}
        chat={makeDmChat()}
        targetUser={makeTargetUser({ role: "user" })}
      />,
    );
    await expect
      .element(page.getByLabelText("Server Owner"))
      .not.toBeInTheDocument();
    await expect
      .element(page.getByLabelText("Server Admin"))
      .not.toBeInTheDocument();
  });

  test("shows both Verified and Owner badge for verified owner", async () => {
    render(
      <ChatProfileModal
        {...BASE_MODAL_PROPS}
        chat={makeDmChat()}
        targetUser={makeTargetUser({ verified: true, role: "owner" })}
      />,
    );
    await expect.element(page.getByLabelText("Verified")).toBeInTheDocument();
    await expect
      .element(page.getByLabelText("Server Owner"))
      .toBeInTheDocument();
  });

  test("shows both Verified and Admin badge for verified admin", async () => {
    render(
      <ChatProfileModal
        {...BASE_MODAL_PROPS}
        chat={makeDmChat()}
        targetUser={makeTargetUser({ verified: true, role: "admin" })}
      />,
    );
    await expect.element(page.getByLabelText("Verified")).toBeInTheDocument();
    await expect
      .element(page.getByLabelText("Server Admin"))
      .toBeInTheDocument();
  });

  test("shows no badges for plain unverified user", async () => {
    render(
      <ChatProfileModal
        {...BASE_MODAL_PROPS}
        chat={makeDmChat()}
        targetUser={makeTargetUser({ verified: false, role: "user" })}
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

  test("Verified badge appears before role badge in user profile header", async () => {
    render(
      <ChatProfileModal
        {...BASE_MODAL_PROPS}
        chat={makeDmChat()}
        targetUser={makeTargetUser({ verified: true, role: "admin" })}
      />,
    );
    const verified = page.getByLabelText("Verified");
    const admin = page.getByLabelText("Server Admin");
    await expect.element(verified).toBeInTheDocument();
    await expect.element(admin).toBeInTheDocument();
    const verifiedEl = await verified.element();
    const adminEl = await admin.element();
    expect(
      verifiedEl.compareDocumentPosition(adminEl) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

// ─── Profile header — group / channel (chat verified badge) ──────────────────

describe("ChatProfileModal — group/channel profile header badges", () => {
  test("shows Verified badge for a verified group", async () => {
    render(
      <ChatProfileModal
        {...BASE_MODAL_PROPS}
        chat={makeGroupChat({ verified: true })}
        targetUser={null}
      />,
    );
    await expect.element(page.getByLabelText("Verified")).toBeInTheDocument();
  });

  test("hides Verified badge for an unverified group", async () => {
    render(
      <ChatProfileModal
        {...BASE_MODAL_PROPS}
        chat={makeGroupChat({ verified: false })}
        targetUser={null}
      />,
    );
    await expect
      .element(page.getByLabelText("Verified"))
      .not.toBeInTheDocument();
  });

  test("shows Verified badge for a verified channel", async () => {
    render(
      <ChatProfileModal
        {...BASE_MODAL_PROPS}
        chat={{
          ...makeGroupChat({ verified: true }),
          type: "channel",
          name: "My Channel",
        }}
        targetUser={null}
      />,
    );
    await expect.element(page.getByLabelText("Verified")).toBeInTheDocument();
  });

  test("does NOT show user role badge in a group profile header", async () => {
    render(
      <ChatProfileModal
        {...BASE_MODAL_PROPS}
        chat={makeGroupChat({ verified: true })}
        targetUser={makeTargetUser({ role: "owner" })}
      />,
    );
    // Group context: UserRoleBadge is suppressed (only chat verified badge shows)
    await expect
      .element(page.getByLabelText("Server Owner"))
      .not.toBeInTheDocument();
  });
});

// ─── Member list row badges ───────────────────────────────────────────────────

describe("ChatProfileModal — member list row badges", () => {
  // Need a group chat with the current user as owner so showMembers works
  const ownerUser = { ...CURRENT_USER, role: "owner" };
  const groupWithOwner = makeGroupChat({
    members: [
      {
        id: 1,
        username: "alice",
        nickname: "Alice",
        color: "#10b981",
        status: "offline",
        role: "owner",
        user_role: "owner",
        user_verified: 0,
      },
    ],
    membersCount: 1,
  });

  test("shows Verified badge in member row when user_verified=1", async () => {
    const member = makeMember({ user_verified: 1 });
    render(
      <ChatProfileModal
        {...BASE_MODAL_PROPS}
        showMembers={true}
        readOnly={false}
        chat={{
          ...groupWithOwner,
          members: [groupWithOwner.members[0], member],
          membersCount: 2,
        }}
        targetUser={null}
        currentUser={ownerUser}
      />,
    );
    await expect.element(page.getByLabelText("Verified")).toBeInTheDocument();
  });

  test("shows Admin badge in member row when user_role='admin'", async () => {
    const member = makeMember({ user_role: "admin" });
    render(
      <ChatProfileModal
        {...BASE_MODAL_PROPS}
        showMembers={true}
        readOnly={false}
        chat={{
          ...groupWithOwner,
          members: [groupWithOwner.members[0], member],
          membersCount: 2,
        }}
        targetUser={null}
        currentUser={ownerUser}
      />,
    );
    await expect
      .element(page.getByLabelText("Server Admin"))
      .toBeInTheDocument();
  });

  test("shows both badges in member row for verified admin", async () => {
    const member = makeMember({ user_verified: 1, user_role: "admin" });
    render(
      <ChatProfileModal
        {...BASE_MODAL_PROPS}
        showMembers={true}
        readOnly={false}
        chat={{
          ...groupWithOwner,
          members: [groupWithOwner.members[0], member],
          membersCount: 2,
        }}
        targetUser={null}
        currentUser={ownerUser}
      />,
    );
    await expect.element(page.getByLabelText("Verified")).toBeInTheDocument();
    await expect
      .element(page.getByLabelText("Server Admin"))
      .toBeInTheDocument();
  });

  test("shows no badges in member row for plain user", async () => {
    const member = makeMember({ user_verified: 0, user_role: "user" });
    // Only the owner member in the group — the plain member has no badges
    render(
      <ChatProfileModal
        {...BASE_MODAL_PROPS}
        showMembers={true}
        readOnly={false}
        chat={{
          ...makeGroupChat({
            members: [
              {
                id: 1,
                username: "alice",
                nickname: "Alice",
                color: "#10b981",
                status: "offline",
                role: "owner",
                user_role: "owner",
                user_verified: 0,
              },
              member,
            ],
            membersCount: 2,
          }),
          verified: false,
        }}
        targetUser={null}
        currentUser={ownerUser}
      />,
    );
    // No Verified, no Admin (the owner badge on alice is a chat role badge, not UserRoleBadge)
    await expect
      .element(page.getByLabelText("Verified"))
      .not.toBeInTheDocument();
    await expect
      .element(page.getByLabelText("Server Admin"))
      .not.toBeInTheDocument();
  });
});
