/**
 * Database card tests for the admin ServicesTab.
 *
 * The Database card pings PostgreSQL when one is configured and stays
 * disabled (grayed out) in SQLite mode, where there is no external
 * database to probe.
 */
import { describe, test, expect } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import ServicesTab from "../../../src/components/admin/ServicesTab.jsx";

function makeData(database) {
  return {
    mediaWorker: { configured: false, reachable: false, latencyMs: null },
    remoteChannel: { enabled: false },
    storage: { driver: "local", reachable: true, latencyMs: 3 },
    database,
  };
}

describe("ServicesTab database card", () => {
  test("sqlite mode renders a disabled Database card", async () => {
    render(
      <ServicesTab
        data={makeData({
          client: "sqlite3",
          configured: false,
          reachable: null,
          latencyMs: null,
        })}
      />,
    );
    const card = page.getByRole("button", { name: /database/i });
    await expect.element(card).toBeInTheDocument();
    await expect.element(card).toBeDisabled();
    await expect
      .element(card.getByText("SQLite mode — local file database."))
      .toBeInTheDocument();
    await expect
      .element(card.getByText("Disabled", { exact: true }))
      .toBeInTheDocument();
  });

  test("postgres mode renders an enabled Database card with latency", async () => {
    render(
      <ServicesTab
        data={makeData({
          client: "postgres",
          configured: true,
          reachable: true,
          latencyMs: 12,
        })}
      />,
    );
    const card = page.getByRole("button", { name: /database/i });
    await expect.element(card).toBeInTheDocument();
    await expect.element(card).toBeEnabled();
    await expect
      .element(card.getByText("PostgreSQL · 12ms"))
      .toBeInTheDocument();
  });

  test("unreachable postgres reports Unreachable", async () => {
    render(
      <ServicesTab
        data={makeData({
          client: "postgres",
          configured: true,
          reachable: false,
          latencyMs: 3001,
        })}
      />,
    );
    const card = page.getByRole("button", { name: /database/i });
    await expect
      .element(card.getByText("PostgreSQL configured but unreachable."))
      .toBeInTheDocument();
    await expect
      .element(card.getByText("Unreachable", { exact: true }))
      .toBeInTheDocument();
  });
});
