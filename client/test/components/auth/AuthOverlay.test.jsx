import { describe, test, expect } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import AuthOverlay from "../../../src/components/auth/AuthOverlay.jsx";

describe("AuthOverlay", () => {
  test("renders nothing when show is false", async () => {
    render(<AuthOverlay show={false} isLogin />);
    await expect
      .element(page.getByText("Signing in..."))
      .not.toBeInTheDocument();
  });

  test("renders nothing when isLogin is false", async () => {
    render(<AuthOverlay show isLogin={false} />);
    await expect
      .element(page.getByText("Signing in..."))
      .not.toBeInTheDocument();
  });

  test("renders nothing when both show and isLogin are false", async () => {
    render(<AuthOverlay show={false} isLogin={false} />);
    await expect
      .element(page.getByText("Signing in..."))
      .not.toBeInTheDocument();
  });

  test('renders "Signing in..." when show and isLogin are both true', async () => {
    render(<AuthOverlay show isLogin />);
    await expect.element(page.getByText("Signing in...")).toBeInTheDocument();
  });
});
