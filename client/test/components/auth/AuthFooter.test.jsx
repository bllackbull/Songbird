import { describe, test, expect, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import AuthFooter from "../../../src/components/auth/AuthFooter.jsx";

describe("AuthFooter", () => {
  test("renders nothing when canSignup is false", async () => {
    render(<AuthFooter canSignup={false} isLogin onSwitchMode={() => {}} />);
    await expect.element(page.getByRole("button")).not.toBeInTheDocument();
  });

  describe("login mode (isLogin = true)", () => {
    test('shows "Don\'t have an account?" prompt', async () => {
      render(<AuthFooter canSignup isLogin onSwitchMode={() => {}} />);
      await expect
        .element(page.getByText("Don't have an account?"))
        .toBeInTheDocument();
    });

    test('shows "Create new account" button', async () => {
      render(<AuthFooter canSignup isLogin onSwitchMode={() => {}} />);
      await expect
        .element(page.getByRole("button", { name: "Create new account" }))
        .toBeInTheDocument();
    });
  });

  describe("signup mode (isLogin = false)", () => {
    test('shows "Already have an account?" prompt', async () => {
      render(<AuthFooter canSignup isLogin={false} onSwitchMode={() => {}} />);
      await expect
        .element(page.getByText("Already have an account?"))
        .toBeInTheDocument();
    });

    test('shows "Back to sign in" button', async () => {
      render(<AuthFooter canSignup isLogin={false} onSwitchMode={() => {}} />);
      await expect
        .element(page.getByRole("button", { name: "Back to sign in" }))
        .toBeInTheDocument();
    });
  });

  test("calls onSwitchMode when the button is clicked", async () => {
    const onSwitchMode = vi.fn();
    render(<AuthFooter canSignup isLogin onSwitchMode={onSwitchMode} />);
    await userEvent.click(
      page.getByRole("button", { name: "Create new account" }),
    );
    expect(onSwitchMode).toHaveBeenCalledTimes(1);
  });
});
