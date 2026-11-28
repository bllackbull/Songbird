/**
 * Browser tests for the TURN setup modal opened from the Services card.
 * Status readings are flags only; secrets are never rendered as values.
 */
import { describe, test, expect, vi, afterEach } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import TurnSetupModal from "../../../src/components/admin/TurnSetupModal.jsx";

const baseStatus = {
  mode: "stun-only",
  stunUrl: "",
  turnUrl: "",
  username: "",
  tokenId: "",
  hasCredential: false,
  hasApiToken: false,
  managedByEnv: {
    stunUrl: false,
    turnUrl: false,
    username: false,
    credential: false,
    tokenId: false,
    apiToken: false,
  },
};

function mockFetch({ status = baseStatus, health = null } = {}) {
  const fetchSpy = vi.fn(async (url, options = {}) => {
    if (String(url).endsWith("/status")) {
      return { ok: true, json: async () => status };
    }
    if (String(url).endsWith("/test")) {
      return {
        ok: true,
        json: async () =>
          health ?? {
            configured: true,
            managed: false,
            reachable: true,
            latencyMs: 12,
          },
      };
    }
    return { ok: true, json: async () => ({ ok: true }) };
  });
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

function putCall(fetchSpy) {
  return fetchSpy.mock.calls.find(
    ([url, options]) =>
      String(url).endsWith("/config") && options?.method === "PUT",
  );
}

function deleteCall(fetchSpy) {
  return fetchSpy.mock.calls.find(
    ([url, options]) =>
      String(url).endsWith("/config") && options?.method === "DELETE",
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TurnSetupModal", () => {
  test("switches between self-hosted and Cloudflare fields", async () => {
    mockFetch();
    render(<TurnSetupModal open onClose={vi.fn()} />);
    await expect.element(page.getByLabelText("TURN URL")).toBeInTheDocument();
    await expect.element(page.getByLabelText("Credential")).toBeInTheDocument();

    await userEvent.click(page.getByRole("button", { name: "Cloudflare" }));
    await expect
      .element(page.getByLabelText("Cloudflare key ID"))
      .toBeInTheDocument();
    await expect.element(page.getByLabelText("API token")).toBeInTheDocument();
    await expect
      .element(page.getByLabelText("TURN URL"))
      .not.toBeInTheDocument();
  });

  test("saves the edited fields as a camelCase patch", async () => {
    const fetchSpy = mockFetch();
    const onChanged = vi.fn();
    render(<TurnSetupModal open onClose={vi.fn()} onChanged={onChanged} />);

    await userEvent.type(
      page.getByLabelText("TURN URL"),
      "turn:relay.example.com:3478",
    );
    await userEvent.type(page.getByLabelText("Username"), "songbird");
    await userEvent.type(page.getByLabelText("Credential"), "secret-pass");
    await userEvent.click(page.getByRole("button", { name: "Save" }));

    const call = putCall(fetchSpy);
    expect(call).toBeDefined();
    expect(JSON.parse(call[1].body)).toEqual(
      expect.objectContaining({
        turnUrl: "turn:relay.example.com:3478",
        username: "songbird",
        credential: "secret-pass",
      }),
    );
    await vi.waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
  });

  test("saving with a blank secret preserves the saved credential", async () => {
    const fetchSpy = mockFetch({
      status: {
        ...baseStatus,
        mode: "self-hosted",
        hasCredential: true,
      },
    });
    render(<TurnSetupModal open onClose={vi.fn()} />);
    await userEvent.type(
      page.getByLabelText("TURN URL"),
      "turn:relay.example.com:3478",
    );
    await userEvent.click(page.getByRole("button", { name: "Save" }));

    const body = JSON.parse(putCall(fetchSpy)[1].body);
    expect(body).not.toHaveProperty("credential");
    expect(body.turnUrl).toBe("turn:relay.example.com:3478");
    expect(Object.values(body).every((value) => value !== "")).toBe(true);
  });

  test("mode toggles stay usable when another field is env-managed", async () => {
    mockFetch({
      status: {
        ...baseStatus,
        mode: "self-hosted",
        turnUrl: "turn:env.example.com:3478",
        managedByEnv: { ...baseStatus.managedByEnv, turnUrl: true },
      },
    });
    render(<TurnSetupModal open onClose={vi.fn()} />);
    await expect
      .element(page.getByRole("button", { name: "Cloudflare" }))
      .not.toBeDisabled();
  });

  test("switching to self-hosted clears the stale Cloudflare keys", async () => {
    const fetchSpy = mockFetch({
      status: {
        ...baseStatus,
        mode: "cloudflare",
        tokenId: "saved-key",
        hasApiToken: true,
      },
    });
    render(<TurnSetupModal open onClose={vi.fn()} />);
    await userEvent.click(page.getByRole("button", { name: "Self-hosted" }));
    await userEvent.type(
      page.getByLabelText("TURN URL"),
      "turn:relay.example.com:3478",
    );
    await userEvent.type(page.getByLabelText("Username"), "songbird");
    await userEvent.type(page.getByLabelText("Credential"), "new-pass");
    await userEvent.click(page.getByRole("button", { name: "Save" }));

    const body = JSON.parse(putCall(fetchSpy)[1].body);
    expect(body).toMatchObject({
      mode: "self-hosted",
      turnUrl: "turn:relay.example.com:3478",
      username: "songbird",
      credential: "new-pass",
    });
    expect(body).not.toHaveProperty("tokenId");
    expect(body).not.toHaveProperty("apiToken");
  });

  test("clear wipes keys from both modes", async () => {
    const fetchSpy = mockFetch({
      status: {
        ...baseStatus,
        mode: "self-hosted",
        tokenId: "saved-key",
        hasCredential: true,
        hasApiToken: true,
      },
    });
    render(<TurnSetupModal open onClose={vi.fn()} />);
    await userEvent.click(page.getByRole("button", { name: "Clear" }));

    expect(deleteCall(fetchSpy)).toBeDefined();
    expect(putCall(fetchSpy)).toBeUndefined();
  });

  test("Test connection and Clear are hidden until TURN is configured", async () => {
    mockFetch();
    render(<TurnSetupModal open onClose={vi.fn()} />);
    await expect
      .element(page.getByRole("button", { name: "Save" }))
      .toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "Test connection" }))
      .not.toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "Clear" }))
      .not.toBeInTheDocument();
  });

  test("Test connection and Clear appear once TURN is configured", async () => {
    mockFetch({
      status: {
        ...baseStatus,
        mode: "self-hosted",
        turnUrl: "turn:relay.example.com:3478",
      },
    });
    render(<TurnSetupModal open onClose={vi.fn()} />);
    await expect
      .element(page.getByRole("button", { name: "Test connection" }))
      .toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "Clear" }))
      .toBeInTheDocument();
  });

  test("env-managed fields are locked and show the environment badge", async () => {
    mockFetch({
      status: {
        ...baseStatus,
        mode: "self-hosted",
        turnUrl: "turn:env.example.com:3478",
        managedByEnv: { ...baseStatus.managedByEnv, turnUrl: true },
      },
    });
    render(<TurnSetupModal open onClose={vi.fn()} />);
    await expect.element(page.getByLabelText("TURN URL")).toBeDisabled();
    await expect
      .element(page.getByText("environment").first())
      .toBeInTheDocument();
  });

  test("shows the result of a connection test", async () => {
    mockFetch({
      status: {
        ...baseStatus,
        mode: "self-hosted",
        turnUrl: "turn:relay.example.com:3478",
      },
    });
    render(<TurnSetupModal open onClose={vi.fn()} />);
    await userEvent.click(
      page.getByRole("button", { name: "Test connection" }),
    );
    await expect.element(page.getByText(/Reachable/)).toBeInTheDocument();
  });

  test("never renders saved secret values", async () => {
    mockFetch({
      status: {
        ...baseStatus,
        mode: "self-hosted",
        turnUrl: "turn:relay.example.com:3478",
        username: "songbird",
        hasCredential: true,
      },
    });
    render(<TurnSetupModal open onClose={vi.fn()} />);
    const credential = page.getByLabelText("Credential");
    await expect.element(credential).toHaveValue("");
    await expect
      .element(credential)
      .toHaveAttribute("placeholder", "Saved — leave blank to keep");
  });
});
