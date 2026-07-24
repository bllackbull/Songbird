import { describe, test, expect } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import UserRoleBadge from "../../../src/components/common/UserRoleBadge.jsx";

describe("UserRoleBadge", () => {
  describe("owner role", () => {
    test("renders aria-label 'Server Owner' for role='owner'", async () => {
      render(<UserRoleBadge role="owner" />);
      await expect
        .element(page.getByLabelText("Server Owner"))
        .toBeInTheDocument();
    });

    test("renders title 'Server Owner' for role='owner'", async () => {
      render(<UserRoleBadge role="owner" />);
      await expect.element(page.getByTitle("Server Owner")).toBeInTheDocument();
    });

    test("is case-insensitive for 'owner'", async () => {
      render(<UserRoleBadge role="OWNER" />);
      await expect
        .element(page.getByLabelText("Server Owner"))
        .toBeInTheDocument();
    });
  });

  describe("admin role", () => {
    test("renders aria-label 'Server Admin' for role='admin'", async () => {
      render(<UserRoleBadge role="admin" />);
      await expect
        .element(page.getByLabelText("Server Admin"))
        .toBeInTheDocument();
    });

    test("renders title 'Server Admin' for role='admin'", async () => {
      render(<UserRoleBadge role="admin" />);
      await expect.element(page.getByTitle("Server Admin")).toBeInTheDocument();
    });

    test("is case-insensitive for 'admin'", async () => {
      render(<UserRoleBadge role="Admin" />);
      await expect
        .element(page.getByLabelText("Server Admin"))
        .toBeInTheDocument();
    });
  });

  describe("no badge for non-privileged roles", () => {
    test("renders nothing for role='user'", async () => {
      render(
        <div data-testid="wrapper">
          <UserRoleBadge role="user" />
        </div>,
      );
      await expect
        .element(page.getByLabelText("Server Owner"))
        .not.toBeInTheDocument();
      await expect
        .element(page.getByLabelText("Server Admin"))
        .not.toBeInTheDocument();
    });

    test("renders nothing for role=null", async () => {
      render(
        <div data-testid="wrapper">
          <UserRoleBadge role={null} />
        </div>,
      );
      await expect
        .element(page.getByLabelText("Server Owner"))
        .not.toBeInTheDocument();
      await expect
        .element(page.getByLabelText("Server Admin"))
        .not.toBeInTheDocument();
    });

    test("renders nothing for role=undefined", async () => {
      render(
        <div data-testid="wrapper">
          <UserRoleBadge />
        </div>,
      );
      await expect
        .element(page.getByLabelText("Server Owner"))
        .not.toBeInTheDocument();
      await expect
        .element(page.getByLabelText("Server Admin"))
        .not.toBeInTheDocument();
    });

    test("renders nothing for empty string role", async () => {
      render(
        <div data-testid="wrapper">
          <UserRoleBadge role="" />
        </div>,
      );
      await expect
        .element(page.getByLabelText("Server Owner"))
        .not.toBeInTheDocument();
      await expect
        .element(page.getByLabelText("Server Admin"))
        .not.toBeInTheDocument();
    });

    test("owner badge does NOT appear when role='admin'", async () => {
      render(<UserRoleBadge role="admin" />);
      await expect
        .element(page.getByLabelText("Server Owner"))
        .not.toBeInTheDocument();
    });

    test("admin badge does NOT appear when role='owner'", async () => {
      render(<UserRoleBadge role="owner" />);
      await expect
        .element(page.getByLabelText("Server Admin"))
        .not.toBeInTheDocument();
    });
  });
});
