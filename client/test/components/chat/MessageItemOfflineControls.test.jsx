import { describe, test, expect, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import DeleteMessageScopeModal from "../../../src/components/modals/DeleteMessageScopeModal.jsx";
import AppContextMenu from "../../../src/components/context-menu/AppContextMenu.jsx";

describe("Offline Controls — DeleteMessageScopeModal", () => {
  test("disables 'Delete for everyone' toggle and forces aria-checked false when offline", async () => {
    render(
      <DeleteMessageScopeModal
        open={true}
        allowDeleteForEveryone={true}
        isOffline={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const toggle = page.getByRole("switch", { name: /delete for everyone/i });
    await expect.element(toggle).toBeDisabled();
    await expect.element(toggle).toHaveAttribute("aria-checked", "false");
  });

  test("disables 'Delete for everyone' toggle when sseConnected is false", async () => {
    render(
      <DeleteMessageScopeModal
        open={true}
        allowDeleteForEveryone={true}
        sseConnected={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const toggle = page.getByRole("switch", { name: /delete for everyone/i });
    await expect.element(toggle).toBeDisabled();
    await expect.element(toggle).toHaveAttribute("aria-checked", "false");
  });

  test("keeps 'Delete for everyone' enabled when online", async () => {
    render(
      <DeleteMessageScopeModal
        open={true}
        allowDeleteForEveryone={true}
        isOffline={false}
        sseConnected={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const toggle = page.getByRole("switch", { name: /delete for everyone/i });
    await expect.element(toggle).not.toBeDisabled();
  });

  test("always passes false for deleteForEveryone when confirming while offline", async () => {
    const onConfirm = vi.fn();
    render(
      <DeleteMessageScopeModal
        open={true}
        allowDeleteForEveryone={true}
        isOffline={true}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    const deleteBtn = page.getByRole("button", { name: /^delete$/i });
    await deleteBtn.click();
    expect(onConfirm).toHaveBeenCalledWith(false);
  });
});

describe("Offline Controls — AppContextMenu Edit action", () => {
  test("disables 'Edit' context menu option when item is disabled offline", async () => {
    const onEditSelect = vi.fn();
    const menu = {
      point: { x: 100, y: 100 },
      items: [
        {
          id: "edit",
          label: "Edit",
          disabled: true,
          onSelect: onEditSelect,
        },
      ],
    };

    render(<AppContextMenu menu={menu} onClose={vi.fn()} />);

    const editBtn = page.getByRole("menuitem", { name: "Edit" });
    await expect.element(editBtn).toBeDisabled();

    await editBtn.click({ force: true });
    expect(onEditSelect).not.toHaveBeenCalled();
  });

  test("enables 'Edit' context menu option when online", async () => {
    const onEditSelect = vi.fn();
    const menu = {
      point: { x: 100, y: 100 },
      items: [
        {
          id: "edit",
          label: "Edit",
          disabled: false,
          onSelect: onEditSelect,
        },
      ],
    };

    render(<AppContextMenu menu={menu} onClose={vi.fn()} />);

    const editBtn = page.getByRole("menuitem", { name: "Edit" });
    await expect.element(editBtn).not.toBeDisabled();

    await editBtn.click();
    expect(onEditSelect).toHaveBeenCalledTimes(1);
  });
});
