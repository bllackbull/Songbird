import { describe, test, expect } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import Avatar from "../../../src/components/common/Avatar.jsx";

describe("Avatar", () => {
  describe("initials fallback", () => {
    test("renders derived initials when no src is provided", async () => {
      render(<Avatar name="John Doe" color="#10b981" />);
      await expect.element(page.getByText("JD")).toBeInTheDocument();
    });

    test("renders explicit initials prop over derived ones", async () => {
      render(<Avatar name="John Doe" initials="XX" color="#10b981" />);
      await expect.element(page.getByText("XX")).toBeInTheDocument();
    });

    test("renders custom placeholderContent over initials", async () => {
      render(
        <Avatar name="John Doe" placeholderContent="🐦" color="#10b981" />,
      );
      await expect.element(page.getByText("🐦")).toBeInTheDocument();
    });

    test('falls back to "S" when no name or alt is given', async () => {
      render(<Avatar color="#10b981" />);
      await expect.element(page.getByText("S")).toBeInTheDocument();
    });
  });

  describe("image rendering", () => {
    // Use a minimal valid data URI so the img element is guaranteed to render
    // regardless of browser. A 404 src triggers onError in Avatar and removes
    // the <img> from the DOM entirely.
    const validSrc =
      "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

    test("renders an img element with the correct src and alt when src is provided", async () => {
      render(<Avatar src={validSrc} alt="Alice" color="#10b981" />);
      const img = page.getByRole("img");
      await expect.element(img).toHaveAttribute("src", validSrc);
      await expect.element(img).toHaveAttribute("alt", "Alice");
    });

    test("does not render img when src is empty", async () => {
      render(<Avatar src="" alt="Alice" color="#10b981" />);
      await expect.element(page.getByRole("img")).not.toBeInTheDocument();
    });
  });

  describe("online badge", () => {
    test("renders the online badge when showOnlineBadge is true", async () => {
      render(<Avatar name="Alice" color="#10b981" showOnlineBadge />);
      await expect.element(page.getByLabelText("online")).toBeInTheDocument();
    });

    // The dot is sized purely by Tailwind classes, which aren't loaded in the
    // test browser, so it has no box to hover. Tooltip.test.jsx covers the
    // hover behaviour itself; here we only assert the badge and its label.
    test("does not render the online badge by default", async () => {
      render(<Avatar name="Alice" color="#10b981" />);
      await expect.element(page.getByLabelText("online")).not.toBeInTheDocument();
    });
  });
});
