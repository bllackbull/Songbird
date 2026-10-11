/**
 * Layout regression tests for the two elements a hardcoded `relative` on the
 * Tooltip wrapper visibly moved: the Avatar online dot and the colour reroll
 * button. Both are absolutely positioned inside a `relative` parent, so if the
 * wrapper takes them out of absolute flow they shift.
 *
 * Tailwind is not loaded in browser tests, so each case declares the handful of
 * utilities it depends on — including `.absolute` before `.relative`, matching
 * Tailwind's emit order, which is what made the original bug possible.
 */
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import Avatar from "../../../src/components/common/Avatar.jsx";
import Tooltip from "../../../src/components/common/Tooltip.jsx";

const CSS = `
  .absolute{position:absolute}
  .fixed{position:fixed}
  .relative{position:relative}
  .inline-flex{display:inline-flex}
  .bottom-0{bottom:0}
  .right-0{right:0}
  .right-1{right:0.25rem}
  .top-1\\/2{top:50%}
  .-translate-y-1\\/2{transform:translateY(-50%)}
`;

let styleEl;
beforeAll(() => {
  styleEl = document.createElement("style");
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);
});
afterAll(() => styleEl.remove());

describe("Avatar online dot placement", () => {
  test("stays pinned to the avatar's bottom-right corner", async () => {
    render(
      <Avatar
        name="Alice"
        color="#10b981"
        showOnlineBadge
        style={{ width: "40px", height: "40px" }}
      />,
    );

    const dot = page.getByLabelText("online");
    await expect.element(dot).toBeInTheDocument();

    const dotEl = dot.element();
    // The Tooltip wrapper carries the absolute positioning.
    const wrapper = dotEl.parentElement;
    expect(getComputedStyle(wrapper).position).toBe("absolute");

    // The dot must sit at the avatar's bottom-right, not pushed below it by
    // being returned to normal flow.
    const avatarBox = dotEl.closest(".relative").getBoundingClientRect();
    const dotBox = dotEl.getBoundingClientRect();
    expect(dotBox.bottom).toBeLessThanOrEqual(avatarBox.bottom + 1);
    expect(dotBox.right).toBeLessThanOrEqual(avatarBox.right + 1);
  });
});

describe("Colour reroll button placement", () => {
  // Mirrors the markup in AdminUserModal / AdminGroupModal.
  test("stays vertically centred inside the colour input", async () => {
    render(
      <div className="relative" style={{ width: "300px" }}>
        <input defaultValue="#10b981" style={{ width: "100%", height: "48px" }} />
        <Tooltip label="Reroll" className="absolute right-1 top-1/2 -translate-y-1/2">
          <button type="button" style={{ width: "36px", height: "36px" }}>
            <svg aria-hidden="true" />
          </button>
        </Tooltip>
      </div>,
    );

    const button = page.getByRole("button", { name: "Reroll" });
    await expect.element(button).toBeInTheDocument();

    const buttonEl = button.element();
    const wrapper = buttonEl.parentElement;
    expect(getComputedStyle(wrapper).position).toBe("absolute");

    // Centre of the button should align with the centre of its container.
    const fieldBox = buttonEl.closest(".relative").getBoundingClientRect();
    const buttonBox = buttonEl.getBoundingClientRect();
    const fieldCentre = fieldBox.top + fieldBox.height / 2;
    const buttonCentre = buttonBox.top + buttonBox.height / 2;
    expect(Math.abs(buttonCentre - fieldCentre)).toBeLessThanOrEqual(1);

    // And it must stay inside the field, not overflow past its right edge.
    expect(buttonBox.right).toBeLessThanOrEqual(fieldBox.right + 1);
  });
});
