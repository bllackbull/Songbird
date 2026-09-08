import { describe, test, expect, vi, afterEach } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import AdminGroupModal from "../../../src/components/admin/AdminGroupModal.jsx";

describe("AdminGroupModal - Auto Add New Users Toggle", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("renders auto-add toggle in add member section with UserPlus icon", async () => {
    render(
      <AdminGroupModal mode="create" onClose={() => {}} onSaved={() => {}} />,
    );

    const toggle = page.getByRole("switch", { name: /auto-add new users/i });
    await expect.element(toggle).toBeInTheDocument();
    await expect.element(toggle).toBeEnabled();
    await expect.element(toggle).toHaveAttribute("aria-checked", "false");
  });

  test("disables auto-add toggle and sets to off when group visibility is private", async () => {
    render(
      <AdminGroupModal mode="create" onClose={() => {}} onSaved={() => {}} />,
    );

    const toggle = page.getByRole("switch", { name: /auto-add new users/i });
    await expect.element(toggle).toBeEnabled();

    // Toggle auto-add ON while public
    await userEvent.click(toggle);
    await expect.element(toggle).toHaveAttribute("aria-checked", "true");

    // Switch visibility to private
    const privateSwitch = page.getByRole("switch", { name: /private group/i });
    await userEvent.click(privateSwitch);

    await expect.element(toggle).toBeDisabled();
    await expect.element(toggle).toHaveAttribute("aria-checked", "false");
  });

  test("includes autoAddNewUsers in submit payload on edit", async () => {
    let capturedPayload = null;
    const mockFetch = vi.fn().mockImplementation((url, options) => {
      if (url === "/api/admin/chats/42") {
        capturedPayload = JSON.parse(options.body);
        return Promise.resolve({
          ok: true,
          json: async () => ({ chat: { id: 42 } }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    vi.stubGlobal("fetch", mockFetch);

    const existingChat = {
      id: 42,
      name: "Existing Public Group",
      type: "group",
      group_username: "publicgroup",
      group_color: "#10b981",
      group_visibility: "public",
      auto_add_new_users: 0,
      owner_id: 1,
      owner_username: "alice",
    };

    const onSaved = vi.fn();
    render(
      <AdminGroupModal
        mode="edit"
        chat={existingChat}
        onClose={() => {}}
        onSaved={onSaved}
      />,
    );

    const toggle = page.getByRole("switch", { name: /auto-add new users/i });
    await userEvent.click(toggle);
    await expect.element(toggle).toHaveAttribute("aria-checked", "true");

    const saveBtn = page.getByRole("button", { name: "Save" });
    await userEvent.click(saveBtn);

    expect(capturedPayload).not.toBeNull();
    expect(capturedPayload.autoAddNewUsers).toBe(true);
    expect(onSaved).toHaveBeenCalled();
  });

  test("initializes autoAddNewUsers from chat in edit mode", async () => {
    const existingChat = {
      id: 42,
      name: "Existing Public Group",
      type: "group",
      group_username: "publicgroup",
      group_color: "#10b981",
      group_visibility: "public",
      auto_add_new_users: 1,
      owner_id: 1,
      owner_username: "alice",
    };

    render(
      <AdminGroupModal
        mode="edit"
        chat={existingChat}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );

    const toggle = page.getByRole("switch", { name: /auto-add new users/i });
    await expect.element(toggle).toBeInTheDocument();
    await expect.element(toggle).toBeEnabled();
    await expect.element(toggle).toHaveAttribute("aria-checked", "true");
  });
});
