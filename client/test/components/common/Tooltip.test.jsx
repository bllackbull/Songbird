import { describe, test, expect, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import Tooltip from "../../../src/components/common/Tooltip.jsx";

describe("Tooltip", () => {
  test("renders no tooltip until hovered", async () => {
    render(
      <Tooltip label="Delete user">
        <button type="button">Go</button>
      </Tooltip>,
    );
    await expect.element(page.getByRole("tooltip")).not.toBeInTheDocument();
  });

  test("shows the label on hover", async () => {
    render(
      <Tooltip label="Delete user">
        <button type="button">Go</button>
      </Tooltip>,
    );
    await page.getByRole("button").hover();
    await expect
      .element(page.getByRole("tooltip"))
      .toHaveTextContent("Delete user");
  });

  test("hides again when the pointer leaves", async () => {
    render(
      <>
        <Tooltip label="Delete user">
          <button type="button">Go</button>
        </Tooltip>
        <span data-testid="elsewhere">elsewhere</span>
      </>,
    );
    await page.getByRole("button").hover();
    await expect.element(page.getByRole("tooltip")).toBeInTheDocument();
    await page.getByTestId("elsewhere").hover();
    await expect.element(page.getByRole("tooltip")).not.toBeInTheDocument();
  });

  test("renders children untouched when the label is empty", async () => {
    render(
      <Tooltip label="">
        <button type="button">Go</button>
      </Tooltip>,
    );
    await page.getByRole("button").hover();
    await expect.element(page.getByRole("tooltip")).not.toBeInTheDocument();
  });

  // Browsers suppress pointer events on disabled controls, so the listeners
  // must live on the wrapper for disabled-button hints to work at all.
  test("works for a disabled button", async () => {
    render(
      <Tooltip label="Cannot ban yourself">
        <button type="button" disabled>
          Ban
        </button>
      </Tooltip>,
    );
    await page.getByRole("button").hover({ force: true });
    await expect
      .element(page.getByRole("tooltip"))
      .toHaveTextContent("Cannot ban yourself");
  });

  test("names an icon-only button with the label", async () => {
    render(
      <Tooltip label="Delete">
        <button type="button">
          <svg aria-hidden="true" />
        </button>
      </Tooltip>,
    );
    await expect
      .element(page.getByRole("button", { name: "Delete" }))
      .toBeInTheDocument();
  });

  // A control with visible text already has an accessible name; overriding it
  // with the tooltip label would break WCAG 2.5.3 (Label in Name).
  test("does not override an existing visible text name", async () => {
    render(
      <Tooltip label="Rows per page">
        <button type="button">25 / page</button>
      </Tooltip>,
    );
    await expect
      .element(page.getByRole("button", { name: "25 / page" }))
      .toBeInTheDocument();
  });

  // Regression: the wrapper used to hardcode `relative`, which silently beat an
  // `absolute` passed via className because Tailwind emits `.relative` after
  // `.absolute` (equal specificity → later rule wins, whatever the class order).
  // That knocked absolutely-positioned targets — the Avatar online dot, the
  // colour reroll button — back into normal flow and visibly moved them.
  test("does not force position:relative onto the wrapper", async () => {
    // Tailwind isn't loaded in browser tests, so declare the two utilities in
    // the same order Tailwind emits them to reproduce the real cascade.
    const style = document.createElement("style");
    style.textContent = ".absolute{position:absolute}.relative{position:relative}";
    document.head.appendChild(style);
    try {
      render(
        <Tooltip label="online" className="absolute bottom-0 right-0">
          <span role="img" aria-label="online" style={{ width: 14, height: 14 }} />
        </Tooltip>,
      );
      const badge = page.getByLabelText("online");
      await expect.element(badge).toBeInTheDocument();
      const wrapper = badge.element().parentElement;
      expect(getComputedStyle(wrapper).position).toBe("absolute");
    } finally {
      style.remove();
    }
  });

  test("keeps the child's own click handler working", async () => {
    const onClick = vi.fn();
    render(
      <Tooltip label="Save">
        <button type="button" onClick={onClick}>
          Save
        </button>
      </Tooltip>,
    );
    await userEvent.click(page.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  describe("asChild mode", () => {
    test("adds no wrapper element around the child", async () => {
      render(
        <div id="tooltip-row">
          <Tooltip label="A very long name" asChild>
            <p className="truncate">A very long name</p>
          </Tooltip>
        </div>,
      );
      const label = page.getByText("A very long name");
      await expect.element(label).toBeInTheDocument();
      // The <p> is a direct child of the row — no wrapper span in between.
      const child = label.element();
      expect(child.tagName).toBe("P");
      expect(child.parentElement.id).toBe("tooltip-row");
    });

    // asChild targets truncated labels, so the tooltip only adds information
    // when the text is actually clipped.
    test("stays silent when the text is not clipped", async () => {
      render(
        <Tooltip label="Bob" asChild>
          <p className="truncate" style={{ width: "400px" }}>
            Bob
          </p>
        </Tooltip>,
      );
      await page.getByText("Bob").hover();
      await expect.element(page.getByRole("tooltip")).not.toBeInTheDocument();
    });

    test("shows the full text when the label is clipped", async () => {
      const long = "Bartholomew Montgomery Fitzgerald the Third";
      render(
        <Tooltip label={long} asChild>
          <p
            className="truncate"
            style={{ width: "40px", overflow: "hidden", whiteSpace: "nowrap" }}
          >
            {long}
          </p>
        </Tooltip>,
      );
      await page.getByText(long).hover();
      await expect.element(page.getByRole("tooltip")).toHaveTextContent(long);
    });

    test("whenTruncated={false} shows the tooltip even when nothing is clipped", async () => {
      render(
        <Tooltip label="Alice and Bob are typing" asChild whenTruncated={false}>
          <p style={{ width: "400px" }}>Alice and 1 other are typing</p>
        </Tooltip>,
      );
      await page.getByText("Alice and 1 other are typing").hover();
      await expect
        .element(page.getByRole("tooltip"))
        .toHaveTextContent("Alice and Bob are typing");
    });
  });
});
