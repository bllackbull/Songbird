import { render } from "vitest-browser-react";
import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { FilterPopover } from "../../../src/components/admin/AdminCommon.jsx";

test("renders filter button and toggles popup module", async () => {
  const onChangeRole = vi.fn();
  const onReset = vi.fn();
  const sections = [
    {
      id: "role",
      label: "Role",
      value: "admin",
      onChange: onChangeRole,
      options: [
        ["", "All roles"],
        ["admin", "Admin"],
        ["user", "User"],
      ],
    },
  ];

  render(<FilterPopover sections={sections} onReset={onReset} />);

  const filterBtn = page.getByRole("button", { name: /filter/i });
  await expect.element(filterBtn).toBeVisible();
  await expect.element(page.getByText("1")).toBeVisible();

  await userEvent.click(filterBtn);
  const popupHeading = page.getByText("Role");
  await expect.element(popupHeading).toBeVisible();

  const resetBtn = page.getByRole("button", { name: /^reset$/i });
  await expect.element(resetBtn).toBeVisible();
  await userEvent.click(resetBtn);
  expect(onReset).toHaveBeenCalledTimes(1);
});

test("renders inactive button when no filters are active", async () => {
  const sections = [
    {
      id: "role",
      label: "Role",
      value: "",
      onChange: vi.fn(),
      options: [
        ["", "All roles"],
        ["admin", "Admin"],
      ],
    },
  ];

  render(<FilterPopover sections={sections} onReset={vi.fn()} />);

  const filterBtn = page.getByRole("button", { name: /^filter$/i });
  await expect.element(filterBtn).toBeVisible();

  await userEvent.click(filterBtn);
  await expect.element(page.getByText("Filter Options")).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: /^reset$/i }))
    .not.toBeInTheDocument();
});
