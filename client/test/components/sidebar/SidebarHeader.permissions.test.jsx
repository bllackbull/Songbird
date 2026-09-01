import { describe, test, expect, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import SidebarHeader from "../../../src/components/sidebar/header/SidebarHeader.jsx";

const BASE_PROPS = {
  mobileTab: "chats",
  editMode: false,
  isConnected: true,
  isUpdating: false,
  hasChats: true,
  selectedChatsCount: 0,
  onExitEdit: vi.fn(),
  onEnterEdit: vi.fn(),
  onDeleteChats: vi.fn(),
  onNewChat: vi.fn(),
  onNewGroup: vi.fn(),
  onNewChannel: vi.fn(),
  chatsSearchQuery: "",
  chatsSearchFocused: false,
  onChatsSearchChange: vi.fn(),
  onChatsSearchFocus: vi.fn(),
  onChatsSearchBlur: vi.fn(),
  onCloseSearch: vi.fn(),
};

describe("SidebarHeader permission prompt banner", () => {
  test("renders notification permission prompt card when mode is notification", async () => {
    const onRequest = vi.fn();
    const onDismiss = vi.fn();

    render(
      <SidebarHeader
        {...BASE_PROPS}
        permissionsPrompt={{
          show: true,
          mode: "notification",
          notification: {
            show: true,
            status: "default",
            onRequest,
          },
          microphone: {
            show: false,
            status: "unknown",
            onRequest: vi.fn(),
          },
          onDismiss,
        }}
      />,
    );

    const alertText = page.getByText("Enable notifications for message alerts");
    await expect.element(alertText).toBeVisible();

    const allowBtn = page.getByRole("button", { name: "Allow" });
    await expect.element(allowBtn).toBeVisible();

    const notNowBtn = page.getByRole("button", { name: "Not now" });
    await expect.element(notNowBtn).toBeVisible();

    // Verify "Not now" appears before "Allow" in DOM order (left-to-right)
    const buttons = page.getByRole("button").all();
    const buttonTexts = (await buttons).map((b) =>
      b.element().textContent.trim(),
    );
    const notNowIndex = buttonTexts.indexOf("Not now");
    const allowIndex = buttonTexts.indexOf("Allow");
    expect(notNowIndex).toBeGreaterThan(-1);
    expect(allowIndex).toBeGreaterThan(notNowIndex);

    await allowBtn.click();
    expect(onRequest).toHaveBeenCalledTimes(1);

    await notNowBtn.click();
    expect(onDismiss).toHaveBeenCalledWith("notification");
  });

  test("renders microphone permission prompt card when mode is microphone", async () => {
    const onRequest = vi.fn();
    const onDismiss = vi.fn();

    render(
      <SidebarHeader
        {...BASE_PROPS}
        permissionsPrompt={{
          show: true,
          mode: "microphone",
          notification: {
            show: false,
            status: "granted",
            onRequest: vi.fn(),
          },
          microphone: {
            show: true,
            status: "prompt",
            onRequest,
          },
          onDismiss,
        }}
      />,
    );

    const alertText = page.getByText("Enable microphone for voice messages");
    await expect.element(alertText).toBeVisible();

    const allowBtn = page.getByRole("button", { name: "Allow" });
    await expect.element(allowBtn).toBeVisible();

    const notNowBtn = page.getByRole("button", { name: "Not now" });
    await expect.element(notNowBtn).toBeVisible();

    // Verify "Not now" appears before "Allow" in DOM order (left-to-right)
    const buttons = page.getByRole("button").all();
    const buttonTexts = (await buttons).map((b) =>
      b.element().textContent.trim(),
    );
    const notNowIndex = buttonTexts.indexOf("Not now");
    const allowIndex = buttonTexts.indexOf("Allow");
    expect(notNowIndex).toBeGreaterThan(-1);
    expect(allowIndex).toBeGreaterThan(notNowIndex);

    await allowBtn.click();
    expect(onRequest).toHaveBeenCalledTimes(1);

    await notNowBtn.click();
    expect(onDismiss).toHaveBeenCalledWith("microphone");
  });

  test("does not render prompt banner when permissionsPrompt.show is false", async () => {
    render(
      <SidebarHeader
        {...BASE_PROPS}
        permissionsPrompt={{
          show: false,
          mode: "notification",
          notification: {
            show: true,
            status: "default",
            onRequest: vi.fn(),
          },
          onDismiss: vi.fn(),
        }}
      />,
    );

    const alertText = page.getByText("Enable notifications for message alerts");
    await expect.element(alertText).not.toBeInTheDocument();
  });

  test("does not render prompt banner when permissionsPrompt is null", async () => {
    render(<SidebarHeader {...BASE_PROPS} permissionsPrompt={null} />);

    const alertText = page.getByText("Enable notifications for message alerts");
    await expect.element(alertText).not.toBeInTheDocument();
  });

  test("does not render prompt banner when mobileTab is settings", async () => {
    render(
      <SidebarHeader
        {...BASE_PROPS}
        mobileTab="settings"
        permissionsPrompt={{
          show: true,
          mode: "notification",
          notification: {
            show: true,
            status: "default",
            onRequest: vi.fn(),
          },
          onDismiss: vi.fn(),
        }}
      />,
    );

    const alertText = page.getByText("Enable notifications for message alerts");
    await expect.element(alertText).not.toBeInTheDocument();
  });
});
