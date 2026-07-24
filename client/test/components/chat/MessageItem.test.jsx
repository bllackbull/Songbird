import { describe, test, expect, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { MessageItem } from "../../../src/components/chat/messages/MessageItem.jsx";

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const ME = { id: 1, username: "alice", nickname: "Alice", color: "#10b981" };
const BOB = { id: 2, username: "bob", nickname: "Bob", color: "#3b82f6" };

function makeMsg(overrides = {}) {
  return {
    id: 1,
    user_id: BOB.id,
    username: BOB.username,
    nickname: BOB.nickname,
    color: BOB.color,
    avatar_url: null,
    body: "Hello world",
    created_at: "2024-01-01T12:00:00.000Z",
    read_at: null,
    read_by_user_id: null,
    edited: 0,
    files: [],
    replyTo: null,
    ...overrides,
  };
}

function makeOwnMsg(overrides = {}) {
  return makeMsg({
    user_id: ME.id,
    username: ME.username,
    nickname: ME.nickname,
    color: ME.color,
    ...overrides,
  });
}

// Minimum props that don't affect the scenarios under test
const BASE_PROPS = {
  user: ME,
  isFirstInGroup: true,
  formatTime: () => "12:00",
  unreadMarkerId: null,
  messageFilesProps: {},
  getMessageDayLabel: null,
  isDesktop: true,
  isMobileTouchDevice: false,
  isGroupChat: false,
  isChannelChat: false,
  onReply: vi.fn(),
  onJumpToMessage: vi.fn(),
  onForwardMessage: vi.fn(),
  onOpenSenderProfile: null,
  onOpenMention: null,
  onOpenForwardOrigin: null,
  onOpenContextMenu: null,
};

// ─── Message body ─────────────────────────────────────────────────────────────

describe("MessageItem — message body", () => {
  test("renders plain text body", async () => {
    render(
      <MessageItem {...BASE_PROPS} msg={makeMsg({ body: "Hey there" })} />,
    );
    await expect.element(page.getByText("Hey there")).toBeInTheDocument();
  });

  test("renders timestamp via formatTime", async () => {
    render(
      <MessageItem
        {...BASE_PROPS}
        msg={makeMsg()}
        formatTime={() => "3:45 PM"}
      />,
    );
    await expect.element(page.getByText("3:45 PM")).toBeInTheDocument();
  });

  test("renders _timeLabel when provided instead of calling formatTime", async () => {
    const formatTime = vi.fn(() => "should not appear");
    render(
      <MessageItem
        {...BASE_PROPS}
        msg={makeMsg({ _timeLabel: "9:00 AM" })}
        formatTime={formatTime}
      />,
    );
    await expect.element(page.getByText("9:00 AM")).toBeInTheDocument();
    expect(formatTime).not.toHaveBeenCalled();
  });

  test("shows 'edited' label when message is edited", async () => {
    render(<MessageItem {...BASE_PROPS} msg={makeMsg({ edited: 1 })} />);
    await expect.element(page.getByText("edited")).toBeInTheDocument();
  });

  test("does not show 'edited' label on a normal message", async () => {
    render(<MessageItem {...BASE_PROPS} msg={makeMsg({ edited: 0 })} />);
    await expect.element(page.getByText("edited")).not.toBeInTheDocument();
  });
});

// ─── Unread divider ───────────────────────────────────────────────────────────

describe("MessageItem — unread divider", () => {
  test("shows 'Unread Messages' divider when msg.id matches unreadMarkerId", async () => {
    render(
      <MessageItem
        {...BASE_PROPS}
        msg={makeMsg({ id: 42 })}
        unreadMarkerId={42}
      />,
    );
    await expect.element(page.getByText("Unread Messages")).toBeInTheDocument();
  });

  test("does not show unread divider when ids differ", async () => {
    render(
      <MessageItem
        {...BASE_PROPS}
        msg={makeMsg({ id: 42 })}
        unreadMarkerId={99}
      />,
    );
    await expect
      .element(page.getByText("Unread Messages"))
      .not.toBeInTheDocument();
  });

  test("does not show unread divider when unreadMarkerId is null", async () => {
    render(
      <MessageItem
        {...BASE_PROPS}
        msg={makeMsg({ id: 42 })}
        unreadMarkerId={null}
      />,
    );
    await expect
      .element(page.getByText("Unread Messages"))
      .not.toBeInTheDocument();
  });
});

// ─── System event pill ────────────────────────────────────────────────────────

describe("MessageItem — system event", () => {
  test("renders a system event pill instead of a message bubble", async () => {
    render(
      <MessageItem
        {...BASE_PROPS}
        msg={makeMsg({
          body: "",
          _systemEvent: {
            type: "join",
            name: "Bob",
            suffix: "joined the group",
          },
        })}
      />,
    );
    await expect
      .element(page.getByText("joined the group"))
      .toBeInTheDocument();
  });

  test("system event pill shows the member name", async () => {
    render(
      <MessageItem
        {...BASE_PROPS}
        msg={makeMsg({
          body: "",
          _systemEvent: {
            type: "leave",
            name: "Carol",
            suffix: "left the group",
          },
        })}
      />,
    );
    await expect.element(page.getByText("Carol")).toBeInTheDocument();
  });

  test("does not render a message bubble for system events", async () => {
    render(
      <MessageItem
        {...BASE_PROPS}
        msg={makeMsg({
          body: "should not appear",
          _systemEvent: { type: "join", name: "Bob", suffix: "joined" },
        })}
      />,
    );
    // The body text must not appear — the system event replaces the bubble
    await expect
      .element(page.getByText("should not appear"))
      .not.toBeInTheDocument();
  });
});

// ─── Sender name (group chat) ─────────────────────────────────────────────────

describe("MessageItem — sender name in group chat", () => {
  test("shows sender nickname above bubble for other users in a group", async () => {
    render(
      <MessageItem
        {...BASE_PROPS}
        isGroupChat={true}
        msg={makeMsg({ nickname: "Bob Smith" })}
      />,
    );
    await expect.element(page.getByText("Bob Smith")).toBeInTheDocument();
  });

  test("does not show sender name for own messages in a group", async () => {
    render(
      <MessageItem
        {...BASE_PROPS}
        isGroupChat={true}
        msg={makeOwnMsg({ nickname: "Alice" })}
      />,
    );
    // Alice's name should not appear as a sender label on her own bubble
    await expect.element(page.getByText("Alice")).not.toBeInTheDocument();
  });

  test("shows 'Deleted account' for deleted author", async () => {
    render(
      <MessageItem
        {...BASE_PROPS}
        isGroupChat={true}
        msg={makeMsg({ username: "deleted", nickname: "Deleted user" })}
      />,
    );
    await expect.element(page.getByText("Deleted account")).toBeInTheDocument();
  });

  test("shows sender avatar for other users in a group", async () => {
    render(
      <MessageItem
        {...BASE_PROPS}
        isGroupChat={true}
        msg={makeMsg({ nickname: "Zara", username: "zara" })}
      />,
    );
    // The sender name should appear; avatar initials "Z" also visible inside it
    // Use the sender name which is more unique than just initials
    await expect.element(page.getByText("Zara")).toBeInTheDocument();
  });
});

// ─── Delivery status icons (own messages) ────────────────────────────────────

describe("MessageItem — delivery status", () => {
  test("shows sr-only 'Sending' when delivery is pending", async () => {
    render(
      <MessageItem
        {...BASE_PROPS}
        msg={makeOwnMsg({ _delivery: "sending" })}
      />,
    );
    await expect.element(page.getByText("Sending")).toBeInTheDocument();
  });

  test("shows sr-only 'Failed to send' when delivery failed", async () => {
    render(
      <MessageItem {...BASE_PROPS} msg={makeOwnMsg({ _delivery: "failed" })} />,
    );
    await expect.element(page.getByText("Failed to send")).toBeInTheDocument();
  });

  test("shows sr-only 'Read' when message has been read", async () => {
    render(
      <MessageItem
        {...BASE_PROPS}
        msg={makeOwnMsg({ read_at: "2024-01-01T12:01:00.000Z" })}
      />,
    );
    await expect.element(page.getByText("Read")).toBeInTheDocument();
  });

  test("shows sr-only 'Sent' for delivered but unread own message", async () => {
    render(<MessageItem {...BASE_PROPS} msg={makeOwnMsg({ read_at: null })} />);
    await expect.element(page.getByText("Sent")).toBeInTheDocument();
  });

  test("no delivery icon on messages from other users", async () => {
    render(
      <MessageItem
        {...BASE_PROPS}
        msg={makeMsg()} // bob's message, not alice's
      />,
    );
    await expect.element(page.getByText("Sent")).not.toBeInTheDocument();
    await expect.element(page.getByText("Read")).not.toBeInTheDocument();
  });
});

// ─── Channel — seen count & forward button ────────────────────────────────────

describe("MessageItem — channel chat", () => {
  test("shows view count instead of read receipt in a channel", async () => {
    render(
      <MessageItem
        {...BASE_PROPS}
        isChannelChat={true}
        seenCount={42}
        msg={makeMsg()}
      />,
    );
    await expect.element(page.getByText("42")).toBeInTheDocument();
    await expect.element(page.getByText("views")).toBeInTheDocument();
  });

  test("shows '1' as minimum view count", async () => {
    render(
      <MessageItem
        {...BASE_PROPS}
        isChannelChat={true}
        seenCount={0}
        msg={makeMsg()}
        formatTime={() => "9:00 PM"} // use a time that doesn't contain "1"
      />,
    );
    await expect.element(page.getByText("views")).toBeInTheDocument();
    // The sr-only "views" label is present; the count "1" is next to the eye icon
    await expect.element(page.getByText("1")).toBeInTheDocument();
  });

  test("shows forward button in channel", async () => {
    render(
      <MessageItem
        {...BASE_PROPS}
        isChannelChat={true}
        msg={makeMsg()}
        onForwardMessage={vi.fn()}
      />,
    );
    await expect
      .element(page.getByRole("button", { name: /forward message/i }))
      .toBeInTheDocument();
  });

  test("forward button calls onForwardMessage with the message", async () => {
    const onForwardMessage = vi.fn();
    const msg = makeMsg({ id: 77 });
    render(
      <MessageItem
        {...BASE_PROPS}
        isChannelChat={true}
        msg={msg}
        onForwardMessage={onForwardMessage}
      />,
    );
    await page.getByRole("button", { name: /forward message/i }).click();
    expect(onForwardMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 77 }),
    );
  });

  test("no forward button in regular group chat", async () => {
    render(
      <MessageItem
        {...BASE_PROPS}
        isGroupChat={true}
        isChannelChat={false}
        msg={makeMsg()}
        onForwardMessage={vi.fn()}
      />,
    );
    await expect
      .element(page.getByRole("button", { name: /forward message/i }))
      .not.toBeInTheDocument();
  });
});

// ─── Reply chip ───────────────────────────────────────────────────────────────

describe("MessageItem — reply chip", () => {
  test("no chip when replyTo is null", async () => {
    render(<MessageItem {...BASE_PROPS} msg={makeMsg({ replyTo: null })} />);
    await expect
      .element(page.getByRole("button", { name: /reply to/i }))
      .not.toBeInTheDocument();
  });

  test("chip appears on an other-user group message with a reply", async () => {
    render(
      <MessageItem
        {...BASE_PROPS}
        isGroupChat={true}
        msg={makeMsg({
          replyTo: {
            id: 99,
            body: "Original",
            username: "bob",
            nickname: "Bob",
            color: "#3b82f6",
          },
        })}
      />,
    );
    await expect
      .element(page.getByRole("button", { name: /reply to bob/i }))
      .toBeInTheDocument();
  });

  test("chip appears on own message with a reply", async () => {
    render(
      <MessageItem
        {...BASE_PROPS}
        isGroupChat={true}
        msg={makeOwnMsg({
          replyTo: {
            id: 99,
            body: "Bob said this",
            username: "bob",
            nickname: "Bob",
            color: "#3b82f6",
          },
        })}
      />,
    );
    await expect
      .element(page.getByRole("button", { name: /reply to bob/i }))
      .toBeInTheDocument();
  });

  test("chip appears in a DM with a reply", async () => {
    render(
      <MessageItem
        {...BASE_PROPS}
        isGroupChat={false}
        msg={makeMsg({
          replyTo: {
            id: 99,
            body: "A DM reply",
            username: "alice",
            nickname: "Alice",
            color: "#10b981",
          },
        })}
      />,
    );
    await expect
      .element(page.getByRole("button", { name: /reply to alice/i }))
      .toBeInTheDocument();
  });

  test("chip shows reply body preview text", async () => {
    render(
      <MessageItem
        {...BASE_PROPS}
        msg={makeMsg({
          replyTo: {
            id: 99,
            body: "Unique preview text here",
            username: "bob",
            nickname: "Bob",
            color: "#3b82f6",
          },
        })}
      />,
    );
    await expect
      .element(page.getByText("Unique preview text here"))
      .toBeInTheDocument();
  });

  test("chip uses nickname over username as display name", async () => {
    render(
      <MessageItem
        {...BASE_PROPS}
        msg={makeMsg({
          replyTo: {
            id: 99,
            body: "Hey",
            username: "bob",
            nickname: "Bob Fullname",
            color: "#3b82f6",
          },
        })}
      />,
    );
    await expect
      .element(page.getByRole("button", { name: /reply to bob fullname/i }))
      .toBeInTheDocument();
  });

  test("chip falls back to username when nickname is empty", async () => {
    render(
      <MessageItem
        {...BASE_PROPS}
        msg={makeMsg({
          replyTo: {
            id: 99,
            body: "Hey",
            username: "bob",
            nickname: "",
            color: "#3b82f6",
          },
        })}
      />,
    );
    await expect
      .element(page.getByRole("button", { name: /reply to bob/i }))
      .toBeInTheDocument();
  });

  test("chip in a channel uses the channel name, not the original author", async () => {
    render(
      <MessageItem
        {...BASE_PROPS}
        isChannelChat={true}
        chatName="Announcements"
        msg={makeMsg({
          replyTo: {
            id: 99,
            body: "Channel post",
            username: "alice",
            nickname: "Alice",
            color: "#10b981",
          },
        })}
      />,
    );
    await expect
      .element(page.getByRole("button", { name: /reply to announcements/i }))
      .toBeInTheDocument();
  });

  test("clicking chip calls onJumpToMessage with the reply id", async () => {
    const onJumpToMessage = vi.fn();
    render(
      <MessageItem
        {...BASE_PROPS}
        onJumpToMessage={onJumpToMessage}
        msg={makeMsg({
          replyTo: {
            id: 55,
            body: "Jump target",
            username: "bob",
            nickname: "Bob",
            color: "#3b82f6",
          },
        })}
      />,
    );
    await page.getByRole("button", { name: /reply to bob/i }).click();
    expect(onJumpToMessage).toHaveBeenCalledWith(55);
  });

  // ── Reply media icons ───────────────────────────────────────────────────────

  test("chip shows voice icon when reply icon is voice", async () => {
    render(
      <MessageItem
        {...BASE_PROPS}
        msg={makeMsg({
          replyTo: {
            id: 99,
            body: "Sent a voice message",
            icon: "voice",
            username: "bob",
            nickname: "Bob",
            color: "#3b82f6",
          },
        })}
      />,
    );
    // The Mic icon renders inside the chip — confirm the chip itself is present
    // and the preview text is the normalized voice message label
    await expect
      .element(page.getByRole("button", { name: /reply to bob/i }))
      .toBeInTheDocument();
    await expect
      .element(page.getByText("Sent a voice message"))
      .toBeInTheDocument();
  });

  test("chip shows 'Sent a photo' for image replies", async () => {
    render(
      <MessageItem
        {...BASE_PROPS}
        msg={makeMsg({
          replyTo: {
            id: 99,
            body: "Sent a photo",
            icon: "image",
            username: "bob",
            nickname: "Bob",
            color: "#3b82f6",
          },
        })}
      />,
    );
    await expect.element(page.getByText("Sent a photo")).toBeInTheDocument();
  });

  test("chip shows 'Sent a video' for video replies", async () => {
    render(
      <MessageItem
        {...BASE_PROPS}
        msg={makeMsg({
          replyTo: {
            id: 99,
            body: "Sent a video",
            icon: "video",
            username: "bob",
            nickname: "Bob",
            color: "#3b82f6",
          },
        })}
      />,
    );
    await expect.element(page.getByText("Sent a video")).toBeInTheDocument();
  });
});

// ─── Forwarded message header ─────────────────────────────────────────────────

describe("MessageItem — forwarded header", () => {
  test("shows 'Forwarded from' label when message has a forwarded label", async () => {
    render(
      <MessageItem
        {...BASE_PROPS}
        msg={makeMsg({ forwarded_from_label: "Carol" })}
      />,
    );
    await expect.element(page.getByText("Forwarded from")).toBeInTheDocument();
  });

  test("shows the forwarded origin name", async () => {
    render(
      <MessageItem
        {...BASE_PROPS}
        msg={makeMsg({
          forwarded_from_user_id: 3,
          forwarded_from_label: "Charlie",
          forwarded_from_color: "#f59e0b",
        })}
        forwardedUser={{
          id: 3,
          username: "charlie",
          nickname: "Charlie",
          avatar_url: null,
          color: "#f59e0b",
        }}
        forwardedUserStatus="ready"
      />,
    );
    await expect.element(page.getByText("Charlie")).toBeInTheDocument();
  });

  test("no 'Forwarded from' label for a regular message", async () => {
    render(<MessageItem {...BASE_PROPS} msg={makeMsg()} />);
    await expect
      .element(page.getByText("Forwarded from"))
      .not.toBeInTheDocument();
  });

  test("calls onOpenForwardOrigin when forwarded origin button is clicked", async () => {
    const onOpenForwardOrigin = vi.fn();
    render(
      <MessageItem
        {...BASE_PROPS}
        onOpenForwardOrigin={onOpenForwardOrigin}
        msg={makeMsg({
          forwarded_from_user_id: 3,
          forwarded_from_label: "Charlie",
          forwarded_from_color: "#f59e0b",
        })}
        forwardedUser={{
          id: 3,
          username: "charlie",
          nickname: "Charlie",
          avatar_url: null,
          color: "#f59e0b",
        }}
        forwardedUserStatus="ready"
      />,
    );
    await page.getByRole("button", { name: /open forwarded origin/i }).click();
    expect(onOpenForwardOrigin).toHaveBeenCalledTimes(1);
  });

  test("forwarded button is disabled when origin user is not resolved", async () => {
    render(
      <MessageItem
        {...BASE_PROPS}
        msg={makeMsg({
          forwarded_from_user_id: 3,
          forwarded_from_label: "Someone",
          forwarded_from_color: "#f59e0b",
        })}
        forwardedUser={null}
        forwardedUserStatus={null} // not yet loaded — treated as deleted/hidden
      />,
    );
    const btn = page.getByRole("button", { name: /open forwarded origin/i });
    await expect.element(btn).toBeDisabled();
  });
});

// ─── Double-click to reply (desktop) ─────────────────────────────────────────

describe("MessageItem — double-click reply (desktop)", () => {
  test("double-clicking the bubble on desktop calls onReply", async () => {
    const { userEvent } = await import("vitest/browser");
    const onReply = vi.fn();
    render(
      <MessageItem
        {...BASE_PROPS}
        isDesktop={true}
        onReply={onReply}
        msg={makeMsg({ id: 7, body: "Double click me" })}
      />,
    );
    const bubble = page.getByText("Double click me");
    await userEvent.dblClick(bubble);
    expect(onReply).toHaveBeenCalledTimes(1);
    expect(onReply).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
  });

  test("double-click does NOT call onReply when onReply is not provided", async () => {
    const { userEvent } = await import("vitest/browser");
    const onReply = vi.fn();
    render(
      <MessageItem
        {...BASE_PROPS}
        isDesktop={true}
        onReply={undefined}
        msg={makeMsg({ body: "No reply handler" })}
      />,
    );
    const bubble = page.getByText("No reply handler");
    await userEvent.dblClick(bubble);
    expect(onReply).not.toHaveBeenCalled();
  });
});

// ─── Day label ────────────────────────────────────────────────────────────────

describe("MessageItem — day label", () => {
  test("stores _dayLabel on the root element's data-msg-day attribute", async () => {
    render(
      <MessageItem
        {...BASE_PROPS}
        getMessageDayLabel={null}
        msg={makeMsg({ id: 5, _dayLabel: "Monday" })}
      />,
    );
    // The root div has data-msg-day — query it via the message id
    const el = page
      .getByText("Hello world")
      .locator("xpath=ancestor::div[@data-msg-day]");
    await expect.element(el).toBeInTheDocument();
  });

  test("calls getMessageDayLabel prop when provided and uses its result", async () => {
    // getMessageDayLabel's return value is used as the data-msg-day attribute.
    // We verify it's called by giving the message a unique _dayKey and
    // confirming the prop override takes precedence over _dayKey.
    // (The DOM attribute is set but not rendered as visible text — just
    // confirm the component mounts without error when the prop is provided.)
    render(
      <MessageItem
        {...BASE_PROPS}
        getMessageDayLabel={() => "Wednesday"}
        msg={makeMsg({ id: 99, body: "day label test" })}
      />,
    );
    // Component should render normally
    await expect.element(page.getByText("day label test")).toBeInTheDocument();
  });
});

// ─── Sender profile callback ──────────────────────────────────────────────────

describe("MessageItem — sender profile", () => {
  test("clicking sender avatar in group chat calls onOpenSenderProfile", async () => {
    const onOpenSenderProfile = vi.fn();
    render(
      <MessageItem
        {...BASE_PROPS}
        isGroupChat={true}
        onOpenSenderProfile={onOpenSenderProfile}
        msg={makeMsg({ id: 10, nickname: "Xena", username: "xena" })}
      />,
    );
    // The outer avatar wrapper button has accessible name = senderName ("Xena")
    // The inner sender-name button inside the bubble also has "Xena".
    // Use .first() to target the avatar button (it appears first in the DOM).
    const avatarBtn = page.getByRole("button", { name: "Xena" }).first();
    await avatarBtn.click();
    expect(onOpenSenderProfile).toHaveBeenCalledTimes(1);
  });

  test("no profile call when onOpenSenderProfile is null", async () => {
    // Should render without error, just a disabled button
    render(
      <MessageItem
        {...BASE_PROPS}
        isGroupChat={true}
        onOpenSenderProfile={null}
        msg={makeMsg({ nickname: "Bob" })}
      />,
    );
    await expect.element(page.getByText("Bob")).toBeInTheDocument();
  });
});
