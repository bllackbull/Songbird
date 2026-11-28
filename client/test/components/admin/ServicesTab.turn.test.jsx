/**
 * TURN server card tests for the admin ServicesTab.
 *
 * The card opens the setup modal (even when unconfigured), and shows an
 * "environment" badge when TURN values are set in .env.
 */
import { describe, test, expect, vi, afterEach } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import ServicesTab from "../../../src/components/admin/ServicesTab.jsx";

function makeData(turn) {
  return {
    mediaWorker: { configured: false, reachable: false, latencyMs: null },
    remoteChannel: { enabled: false },
    storage: { driver: "local", reachable: true, latencyMs: 3 },
    database: { client: "sqlite3", configured: false },
    turn,
  };
}

function mockFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) => {
      if (String(url).endsWith("/status")) {
        return {
          ok: true,
          json: async () => ({
            mode: "stun-only",
            stunUrl: "",
            turnUrl: "",
            username: "",
            tokenId: "",
            hasCredential: false,
            hasApiToken: false,
            managedByEnv: {},
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ServicesTab TURN server card", () => {
  test("unconfigured card opens the setup modal when clicked", async () => {
    mockFetch();
    render(
      <ServicesTab
        data={makeData({
          configured: false,
          managed: false,
          reachable: null,
          latencyMs: null,
        })}
      />,
    );
    const card = page.getByRole("button", { name: /turn server/i });
    await expect.element(card).toBeInTheDocument();
    await expect.element(card).not.toBeDisabled();
    await expect
      .element(card.getByText("STUN only — no TURN relay configured."))
      .toBeInTheDocument();
    await expect
      .element(card.getByText("Disabled", { exact: true }))
      .toBeInTheDocument();

    await userEvent.click(card);
    await expect
      .element(page.getByRole("button", { name: "Save" }))
      .toBeInTheDocument();
  });

  test("env-managed TURN config shows an environment badge", async () => {
    mockFetch();
    render(
      <ServicesTab
        data={makeData({
          configured: true,
          managed: false,
          reachable: true,
          latencyMs: 8,
          mode: "self-hosted",
          managedByEnv: { turnUrl: true },
        })}
      />,
    );
    const card = page.getByRole("button", { name: /turn server/i });
    await expect.element(card.getByText("environment")).toBeInTheDocument();
    await expect
      .element(card.getByText("TURN settings are set in .env"))
      .toBeInTheDocument();
  });

  test("configured and reachable renders an enabled TURN server card with latency", async () => {
    render(
      <ServicesTab
        data={makeData({
          configured: true,
          managed: false,
          reachable: true,
          latencyMs: 18,
        })}
      />,
    );
    const card = page.getByRole("button", { name: /turn server/i });
    await expect.element(card).toBeInTheDocument();
    await expect.element(card).not.toBeDisabled();
    await expect
      .element(card.getByText("TURN relay · 18ms"))
      .toBeInTheDocument();
    await expect
      .element(card.getByText("Active", { exact: true }))
      .toBeInTheDocument();
  });

  test("configured but unreachable renders Unreachable status", async () => {
    render(
      <ServicesTab
        data={makeData({
          configured: true,
          managed: true,
          reachable: false,
          latencyMs: null,
        })}
      />,
    );
    const card = page.getByRole("button", { name: /turn server/i });
    await expect.element(card).toBeInTheDocument();
    await expect.element(card).not.toBeDisabled();
    await expect
      .element(card.getByText("Configured but unreachable."))
      .toBeInTheDocument();
    await expect
      .element(card.getByText("Unreachable", { exact: true }))
      .toBeInTheDocument();
  });
});
