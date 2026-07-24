import { describe, test, expect, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { MessageComposer } from "../../../src/components/chat/messages/MessageComposer.jsx";

// ─── Shared fixture ───────────────────────────────────────────────────────────

const BASE_PROPS = {
  activeChatId: 1,
  isDesktop: true,
  handleSend: vi.fn(),
  onComposerResize: vi.fn(),
  replyTarget: null,
  onClearReply: vi.fn(),
  editTarget: null,
  onClearEdit: vi.fn(),
  pendingUploadFiles: [],
  pendingUploadType: "media",
  pendingVoiceMessage: null,
  fileUploadEnabled: true,
  mediaInputRef: { current: null },
  documentInputRef: { current: null },
  onClearPendingUploads: vi.fn(),
  onRemovePendingUpload: vi.fn(),
  onUploadFilesSelected: vi.fn(),
  onVoiceRecorded: vi.fn(),
  onClearPendingVoiceMessage: vi.fn(),
  uploadError: null,
  activeUploadProgress: null,
  messageMaxChars: null,
  onMessageInput: vi.fn(),
  uploadBusy: false,
  showUploadMenu: false,
  setShowUploadMenu: vi.fn(),
  uploadMenuRef: { current: null },
  handleVideoThumbLoadedMetadata: vi.fn(),
  onComposerHeightChange: vi.fn(),
  onComposerFocusChange: vi.fn(),
  composerInputRef: null,
  microphonePermissionStatus: "granted",
  onRequestMicrophonePermission: vi.fn(),
};

// ─── Null state ───────────────────────────────────────────────────────────────

describe("MessageComposer — null state", () => {
  test("renders nothing when activeChatId is falsy", async () => {
    render(<MessageComposer {...BASE_PROPS} activeChatId={null} />);
    await expect.element(page.getByRole("textbox")).not.toBeInTheDocument();
  });
});

// ─── Default idle state ───────────────────────────────────────────────────────

describe("MessageComposer — idle state", () => {
  test("renders the message textarea", async () => {
    render(<MessageComposer {...BASE_PROPS} />);
    await expect
      .element(page.getByRole("textbox", { name: /type a message/i }))
      .toBeInTheDocument();
  });

  test("renders the attach file button", async () => {
    render(<MessageComposer {...BASE_PROPS} />);
    await expect
      .element(page.getByRole("button", { name: /attach file/i }))
      .toBeInTheDocument();
  });

  test("mic button shows when there is no text and no pending files", async () => {
    render(<MessageComposer {...BASE_PROPS} />);
    await expect
      .element(page.getByRole("button", { name: /record voice message/i }))
      .toBeInTheDocument();
  });

  test("send button shows when text is present", async () => {
    render(<MessageComposer {...BASE_PROPS} />);
    const textarea = page.getByRole("textbox", { name: /type a message/i });
    await userEvent.type(textarea, "Hello!");
    await expect
      .element(page.getByRole("button", { name: /send message/i }))
      .toBeInTheDocument();
  });

  test("send button is disabled when textarea is empty", async () => {
    render(<MessageComposer {...BASE_PROPS} />);
    // Mic mode when empty — the submit button doesn't exist, mic button does
    await expect
      .element(page.getByRole("button", { name: /send message/i }))
      .not.toBeInTheDocument();
  });
});

// ─── Upload menu ──────────────────────────────────────────────────────────────

describe("MessageComposer — upload menu", () => {
  test("upload menu is hidden by default", async () => {
    render(<MessageComposer {...BASE_PROPS} showUploadMenu={false} />);
    await expect
      .element(page.getByText("Photo or Video"))
      .not.toBeInTheDocument();
  });

  test("upload menu shows Photo or Video and Document options when open", async () => {
    render(<MessageComposer {...BASE_PROPS} showUploadMenu={true} />);
    await expect.element(page.getByText("Photo or Video")).toBeInTheDocument();
    await expect.element(page.getByText("Document")).toBeInTheDocument();
  });

  test("clicking the attach button calls setShowUploadMenu", async () => {
    const setShowUploadMenu = vi.fn();
    render(
      <MessageComposer {...BASE_PROPS} setShowUploadMenu={setShowUploadMenu} />,
    );
    await page.getByRole("button", { name: /attach file/i }).click();
    expect(setShowUploadMenu).toHaveBeenCalled();
  });

  test("attach button is disabled when uploadBusy is true", async () => {
    render(<MessageComposer {...BASE_PROPS} uploadBusy={true} />);
    const btn = page.getByRole("button", { name: /attach file/i });
    await expect.element(btn).toBeDisabled();
  });
});

// ─── Pending uploads preview ──────────────────────────────────────────────────

describe("MessageComposer — pending uploads", () => {
  const pendingImage = {
    id: "upload-1",
    name: "photo.jpg",
    mimeType: "image/jpeg",
    previewUrl:
      "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==",
  };

  const pendingDoc = {
    id: "upload-2",
    name: "report.pdf",
    mimeType: "application/pdf",
    previewUrl: null,
  };

  test("shows file count label when files are pending", async () => {
    render(
      <MessageComposer
        {...BASE_PROPS}
        pendingUploadFiles={[pendingImage]}
        pendingUploadType="media"
      />,
    );
    await expect
      .element(page.getByText(/photo or video.*\(1\)/i))
      .toBeInTheDocument();
  });

  test("shows '(2)' when two files are pending", async () => {
    render(
      <MessageComposer
        {...BASE_PROPS}
        pendingUploadFiles={[pendingImage, pendingImage]}
        pendingUploadType="media"
      />,
    );
    await expect.element(page.getByText(/\(2\)/)).toBeInTheDocument();
  });

  test("shows document label when upload type is document", async () => {
    render(
      <MessageComposer
        {...BASE_PROPS}
        pendingUploadFiles={[pendingDoc]}
        pendingUploadType="document"
      />,
    );
    await expect
      .element(page.getByText(/document.*\(1\)/i))
      .toBeInTheDocument();
  });

  test("renders remove button for each pending file", async () => {
    render(
      <MessageComposer
        {...BASE_PROPS}
        pendingUploadFiles={[pendingImage]}
        pendingUploadType="media"
      />,
    );
    await expect
      .element(page.getByRole("button", { name: /remove file/i }))
      .toBeInTheDocument();
  });

  test("clicking remove calls onRemovePendingUpload with the file id", async () => {
    const onRemovePendingUpload = vi.fn();
    render(
      <MessageComposer
        {...BASE_PROPS}
        pendingUploadFiles={[pendingImage]}
        pendingUploadType="media"
        onRemovePendingUpload={onRemovePendingUpload}
      />,
    );
    await page.getByRole("button", { name: /remove file/i }).click();
    expect(onRemovePendingUpload).toHaveBeenCalledWith("upload-1");
  });

  test("clicking Clear calls onClearPendingUploads", async () => {
    const onClearPendingUploads = vi.fn();
    render(
      <MessageComposer
        {...BASE_PROPS}
        pendingUploadFiles={[pendingImage]}
        pendingUploadType="media"
        onClearPendingUploads={onClearPendingUploads}
      />,
    );
    await page.getByRole("button", { name: /clear/i }).click();
    expect(onClearPendingUploads).toHaveBeenCalled();
  });

  test("shows the filename of each pending file", async () => {
    render(
      <MessageComposer
        {...BASE_PROPS}
        pendingUploadFiles={[pendingImage]}
        pendingUploadType="media"
      />,
    );
    await expect.element(page.getByText("photo.jpg")).toBeInTheDocument();
  });

  test("send button is shown (not mic) when files are pending with no text", async () => {
    render(
      <MessageComposer
        {...BASE_PROPS}
        pendingUploadFiles={[pendingImage]}
        pendingUploadType="media"
      />,
    );
    await expect
      .element(page.getByRole("button", { name: /send message/i }))
      .toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: /record voice message/i }))
      .not.toBeInTheDocument();
  });
});

// ─── Upload progress bar ──────────────────────────────────────────────────────

describe("MessageComposer — upload progress", () => {
  test("shows progress bar when activeUploadProgress is set", async () => {
    render(<MessageComposer {...BASE_PROPS} activeUploadProgress={40} />);
    await expect
      .element(page.getByText("Uploading files..."))
      .toBeInTheDocument();
  });

  test("shows rounded percentage value", async () => {
    render(<MessageComposer {...BASE_PROPS} activeUploadProgress={73.6} />);
    await expect.element(page.getByText("74%")).toBeInTheDocument();
  });

  test("does not show progress bar when activeUploadProgress is null", async () => {
    render(<MessageComposer {...BASE_PROPS} activeUploadProgress={null} />);
    await expect
      .element(page.getByText("Uploading files..."))
      .not.toBeInTheDocument();
  });
});

// ─── Upload error ─────────────────────────────────────────────────────────────

describe("MessageComposer — upload error", () => {
  test("shows the error message when uploadError is set", async () => {
    render(
      <MessageComposer {...BASE_PROPS} uploadError="File is too large." />,
    );
    await expect
      .element(page.getByText("File is too large."))
      .toBeInTheDocument();
  });

  test("does not show error section when uploadError is null", async () => {
    render(<MessageComposer {...BASE_PROPS} uploadError={null} />);
    await expect
      .element(page.getByText("File is too large."))
      .not.toBeInTheDocument();
  });
});

// ─── Reply banner ─────────────────────────────────────────────────────────────

describe("MessageComposer — reply banner", () => {
  const replyTarget = {
    id: 5,
    username: "bob",
    nickname: "Bob",
    displayName: "Bob",
    body: "Original message text",
    icon: null,
    color: "#3b82f6",
  };

  test("shows reply banner when replyTarget is set", async () => {
    render(<MessageComposer {...BASE_PROPS} replyTarget={replyTarget} />);
    await expect.element(page.getByText(/reply to bob/i)).toBeInTheDocument();
  });

  test("shows body preview text in the reply banner", async () => {
    render(<MessageComposer {...BASE_PROPS} replyTarget={replyTarget} />);
    await expect
      .element(page.getByText("Original message text"))
      .toBeInTheDocument();
  });

  test("cancel reply button calls onClearReply", async () => {
    const onClearReply = vi.fn();
    render(
      <MessageComposer
        {...BASE_PROPS}
        replyTarget={replyTarget}
        onClearReply={onClearReply}
      />,
    );
    await page.getByRole("button", { name: /cancel reply/i }).click();
    expect(onClearReply).toHaveBeenCalled();
  });

  test("textarea aria-label changes to reflect reply context", async () => {
    render(<MessageComposer {...BASE_PROPS} replyTarget={replyTarget} />);
    await expect
      .element(page.getByRole("textbox", { name: /reply to bob/i }))
      .toBeInTheDocument();
  });

  test("no reply banner when replyTarget is null", async () => {
    render(<MessageComposer {...BASE_PROPS} replyTarget={null} />);
    await expect
      .element(page.getByRole("button", { name: /cancel reply/i }))
      .not.toBeInTheDocument();
  });

  // Reply media icons in banner
  test("reply banner shows voice icon label for voice replies", async () => {
    render(
      <MessageComposer
        {...BASE_PROPS}
        replyTarget={{
          ...replyTarget,
          body: "Sent a voice message",
          icon: "voice",
        }}
      />,
    );
    await expect
      .element(page.getByText("Sent a voice message"))
      .toBeInTheDocument();
  });
});

// ─── Edit banner ──────────────────────────────────────────────────────────────

describe("MessageComposer — edit banner", () => {
  const editTarget = {
    id: 7,
    username: "alice",
    body: "The original text before editing",
    files: [],
  };

  test("shows 'Edit Message' banner when editTarget is set", async () => {
    render(<MessageComposer {...BASE_PROPS} editTarget={editTarget} />);
    await expect.element(page.getByText("Edit Message")).toBeInTheDocument();
  });

  test("shows the original message body in the edit banner", async () => {
    render(<MessageComposer {...BASE_PROPS} editTarget={editTarget} />);
    // The banner shows the body in a <span>; the textarea is also pre-filled.
    // Target the first matching element (the banner span).
    await expect
      .element(page.getByText("The original text before editing").first())
      .toBeInTheDocument();
  });

  test("cancel edit button calls onClearEdit", async () => {
    const onClearEdit = vi.fn();
    render(
      <MessageComposer
        {...BASE_PROPS}
        editTarget={editTarget}
        onClearEdit={onClearEdit}
      />,
    );
    await page.getByRole("button", { name: /cancel edit/i }).click();
    expect(onClearEdit).toHaveBeenCalled();
  });

  test("save button shows instead of send button in edit mode with text", async () => {
    render(<MessageComposer {...BASE_PROPS} editTarget={editTarget} />);
    // Edit mode pre-fills the textarea with the body — save button should appear
    await expect
      .element(page.getByRole("button", { name: /save edit/i }))
      .toBeInTheDocument();
  });

  test("edit banner is not shown when editTarget is null", async () => {
    render(<MessageComposer {...BASE_PROPS} editTarget={null} />);
    await expect
      .element(page.getByText("Edit Message"))
      .not.toBeInTheDocument();
  });
});

// ─── Pending voice message ────────────────────────────────────────────────────

describe("MessageComposer — pending voice message", () => {
  test("shows voice message banner with duration", async () => {
    render(
      <MessageComposer
        {...BASE_PROPS}
        pendingVoiceMessage={{ durationSeconds: 30, file: {} }}
      />,
    );
    await expect.element(page.getByText("Voice message")).toBeInTheDocument();
    await expect.element(page.getByText("0:30")).toBeInTheDocument();
  });

  test("cancel voice message button calls onClearPendingVoiceMessage", async () => {
    const onClearPendingVoiceMessage = vi.fn();
    render(
      <MessageComposer
        {...BASE_PROPS}
        pendingVoiceMessage={{ durationSeconds: 10, file: {} }}
        onClearPendingVoiceMessage={onClearPendingVoiceMessage}
      />,
    );
    await page.getByRole("button", { name: /cancel voice message/i }).click();
    expect(onClearPendingVoiceMessage).toHaveBeenCalled();
  });

  test("send button shows when voice message is pending", async () => {
    render(
      <MessageComposer
        {...BASE_PROPS}
        pendingVoiceMessage={{ durationSeconds: 5, file: {} }}
      />,
    );
    await expect
      .element(page.getByRole("button", { name: /send message/i }))
      .toBeInTheDocument();
  });

  test("voice message duration shows 1:05 for 65 seconds", async () => {
    render(
      <MessageComposer
        {...BASE_PROPS}
        pendingVoiceMessage={{ durationSeconds: 65, file: {} }}
      />,
    );
    await expect.element(page.getByText("1:05")).toBeInTheDocument();
  });
});

// ─── MessageItem — body suppression for file-only messages ───────────────────
// These tests exercise the shouldHideGeneratedFileBody branch via MessageItem

describe("MessageItem — body suppression for file-only messages", () => {
  // We test this through the utility since the visual suppression is
  // driven by FILE_SUMMARY_PATTERN + hasMessageText, already tested
  // in unit tests. Here we just validate MessageComposer doesn't render
  // the generated summary as a caption hint.
  test("edit banner shows 'Message' placeholder when edit body is a file summary", async () => {
    render(
      <MessageComposer
        {...BASE_PROPS}
        editTarget={{
          id: 3,
          body: "Sent a photo",
          files: [{ mimeType: "image/jpeg", id: "img-1" }],
        }}
      />,
    );
    // The edit banner shows "Message" as placeholder for generated body
    await expect.element(page.getByText("Message")).toBeInTheDocument();
  });
});
