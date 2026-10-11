import { describe, test, expect, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import AuthHeader from "../../../src/components/auth/AuthHeader.jsx";

describe("AuthHeader", () => {
  describe("title text", () => {
    test('shows "Sign in" label and "Welcome" heading when isLogin is true', async () => {
      render(
        <AuthHeader
          isLogin
          isDark={false}
          themeToggleAnimating={false}
          onToggleTheme={() => {}}
        />,
      );
      await expect.element(page.getByText("Sign in")).toBeInTheDocument();
      await expect.element(page.getByText("Welcome")).toBeInTheDocument();
    });

    test('shows "Create account" label and "Join the flock" heading when isLogin is false', async () => {
      render(
        <AuthHeader
          isLogin={false}
          isDark={false}
          themeToggleAnimating={false}
          onToggleTheme={() => {}}
        />,
      );
      await expect
        .element(page.getByText("Create account"))
        .toBeInTheDocument();
      await expect
        .element(page.getByText("Join the flock"))
        .toBeInTheDocument();
    });
  });

  describe("theme toggle button", () => {
    test("renders the toggle button with correct aria-label", async () => {
      render(
        <AuthHeader
          isLogin
          isDark={false}
          themeToggleAnimating={false}
          onToggleTheme={() => {}}
        />,
      );
      await expect
        .element(page.getByRole("button", { name: "Toggle dark mode" }))
        .toBeInTheDocument();
    });

    test("calls onToggleTheme when the button is clicked", async () => {
      const onToggleTheme = vi.fn();
      render(
        <AuthHeader
          isLogin
          isDark={false}
          themeToggleAnimating={false}
          onToggleTheme={onToggleTheme}
        />,
      );
      await userEvent.click(
        page.getByRole("button", { name: "Toggle dark mode" }),
      );
      expect(onToggleTheme).toHaveBeenCalledTimes(1);
    });
  });
});
