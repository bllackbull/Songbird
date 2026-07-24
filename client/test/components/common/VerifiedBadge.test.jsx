import { describe, test, expect } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import VerifiedBadge from "../../../src/components/common/VerifiedBadge.jsx";

describe("VerifiedBadge", () => {
  test("renders with aria-label 'Verified'", async () => {
    render(<VerifiedBadge />);
    await expect.element(page.getByLabelText("Verified")).toBeInTheDocument();
  });

  test("renders with title 'Verified'", async () => {
    render(<VerifiedBadge />);
    await expect.element(page.getByTitle("Verified")).toBeInTheDocument();
  });

  test("renders an SVG element inside", async () => {
    render(<VerifiedBadge />);
    const badge = page.getByLabelText("Verified");
    await expect.element(badge).toBeInTheDocument();
    // The wrapper span contains an SVG
    const svg = badge.locator("svg");
    await expect.element(svg).toBeInTheDocument();
  });

  test("applies custom size to the SVG", async () => {
    render(<VerifiedBadge size={20} />);
    const svg = page.getByLabelText("Verified").locator("svg");
    await expect.element(svg).toHaveAttribute("width", "20");
    await expect.element(svg).toHaveAttribute("height", "20");
  });

  test("uses default size of 13 when not specified", async () => {
    render(<VerifiedBadge />);
    const svg = page.getByLabelText("Verified").locator("svg");
    await expect.element(svg).toHaveAttribute("width", "13");
    await expect.element(svg).toHaveAttribute("height", "13");
  });

  test("applies extra className to the wrapper span", async () => {
    render(<VerifiedBadge className="my-custom-class" />);
    const badge = page.getByLabelText("Verified");
    await expect.element(badge).toHaveClass("my-custom-class");
  });
});
