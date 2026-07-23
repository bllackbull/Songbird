import { describe, test, expect } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import AuthStatusBanner from "../../../src/components/auth/AuthStatusBanner.jsx";

describe("AuthStatusBanner", () => {
  test("renders nothing when status is null", async () => {
    render(<AuthStatusBanner status={null} />);
    // Component returns null — no <p> should appear in the document
    await expect.element(page.getByRole("paragraph")).not.toBeInTheDocument();
  });

  test("renders nothing when status is undefined", async () => {
    render(<AuthStatusBanner status={undefined} />);
    await expect.element(page.getByRole("paragraph")).not.toBeInTheDocument();
  });

  test("renders nothing when status is an empty string", async () => {
    render(<AuthStatusBanner status="" />);
    await expect.element(page.getByRole("paragraph")).not.toBeInTheDocument();
  });

  test("renders the status message when provided", async () => {
    render(<AuthStatusBanner status="Invalid username or password." />);
    await expect
      .element(page.getByText("Invalid username or password."))
      .toBeInTheDocument();
  });

  test("renders a different error message", async () => {
    render(<AuthStatusBanner status="Account already exists." />);
    await expect
      .element(page.getByText("Account already exists."))
      .toBeInTheDocument();
  });
});
