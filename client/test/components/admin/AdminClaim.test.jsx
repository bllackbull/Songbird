import { describe, test, expect, vi, beforeEach } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import AdminPage from "../../../src/pages/AdminPage.jsx";

describe("AdminPage Emergency Claim UI", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  test("renders claim form for non-admin user when on secure context", async () => {
    const user = { id: 10, username: "alice", role: "user" };
    render(<AdminPage user={user} setUser={() => {}} onBack={() => {}} />);

    const heading = page.getByText("Emergency Claim");
    await expect.element(heading).toBeInTheDocument();

    const input = page.getByPlaceholder("Enter ADMIN_API_TOKEN");
    await expect.element(input).toBeInTheDocument();
  });

  test("submits token and elevates role on success", async () => {
    const setUserMock = vi.fn();
    const fetchSpy = vi.fn().mockImplementation(async (url, _options) => {
      if (url.includes("/api/admin/claim")) {
        return {
          ok: true,
          json: async () => ({ ok: true, role: "owner" }),
        };
      }
      return { ok: false, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchSpy);

    const user = { id: 10, username: "alice", role: "user" };
    render(<AdminPage user={user} setUser={setUserMock} onBack={() => {}} />);

    const input = page.getByPlaceholder("Enter ADMIN_API_TOKEN");
    await input.fill("valid-token");

    const submitBtn = page.getByRole("button", { name: "Claim Privileges" });
    await userEvent.click(submitBtn);

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/admin/claim"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ token: "valid-token" }),
      }),
    );
    expect(setUserMock).toHaveBeenCalled();
    const updater = setUserMock.mock.calls[0][0];
    const updatedUser = typeof updater === "function" ? updater(user) : updater;
    expect(updatedUser).toEqual({ id: 10, username: "alice", role: "owner" });
  });

  test("shows error message on claim failure", async () => {
    const setUserMock = vi.fn();
    const fetchSpy = vi.fn().mockImplementation(async (url) => {
      if (url.includes("/api/admin/claim")) {
        return {
          ok: false,
          json: async () => ({ error: "Invalid token" }),
        };
      }
      return { ok: false, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchSpy);

    const user = { id: 10, username: "alice", role: "user" };
    render(<AdminPage user={user} setUser={setUserMock} onBack={() => {}} />);

    const input = page.getByPlaceholder("Enter ADMIN_API_TOKEN");
    await input.fill("wrong-token");

    const submitBtn = page.getByRole("button", { name: "Claim Privileges" });
    await userEvent.click(submitBtn);

    const errorMsg = page.getByText("Invalid token");
    await expect.element(errorMsg).toBeInTheDocument();
    expect(setUserMock).not.toHaveBeenCalled();
  });
});
