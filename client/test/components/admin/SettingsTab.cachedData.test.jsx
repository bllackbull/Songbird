/**
 * Regression tests for the SettingsTab "changes reset on background refresh" bug.
 *
 * Root cause: fetchSettings is memoized on `cachedData`. Every time the parent's
 * auto-refresh fires it updates cache.settings.data with a new object reference,
 * even though the values are identical. This makes cachedData a new reference →
 * fetchSettings gets a new identity → the useEffect re-runs → fetchSettings sees
 * cachedData?.settings is truthy → calls setLocalVals({}) → wipes unsaved edits.
 *
 * Test notes:
 * - vitest-browser-react's render() does not expose rerender(). To simulate a
 *   prop change we wrap SettingsTab in a stateful parent component and update
 *   its state — that re-renders the child with new props, exactly like the real
 *   AdminPanel does when its cache refreshes.
 * - The Toggle button has no accessible name on its own element, so we find it
 *   by locating the first switch inside the settings panel.
 */
import { describe, test, expect, vi, afterEach } from "vitest";
import { useState } from "react";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import SettingsTab from "../../../src/components/admin/SettingsTab.jsx";

// Minimal settings payload — just enough to render a bool toggle and an int input.
function makeSettings(overrides = []) {
  return [
    {
      key: "APP_DEBUG",
      label: "Debug Mode",
      description: "Enable verbose logging.",
      type: "bool",
      value: "false",
      defaultVal: "false",
      group: "diagnostics",
      envLocked: false,
      nullable: false,
    },
    {
      key: "MESSAGE_MAX_CHARS",
      label: "Max message length",
      description: "Maximum characters per message.",
      type: "int",
      value: "2000",
      defaultVal: "2000",
      min: 1,
      max: 50000,
      group: "limits",
      envLocked: false,
      nullable: false,
    },
    ...overrides,
  ];
}

function makeCachedData(settings) {
  return { settings };
}

// ─── Wrapper that lets us simulate AdminPanel pushing new cachedData ──────────
// vitest-browser-react's render() has no rerender(); we drive prop changes via
// state so the child receives updated props exactly as it would in production.

function SettingsTabHarness({ initialCachedData, onMutated }) {
  const [cachedData, setCachedData] = useState(initialCachedData);

  // Expose the setter via a data attribute on a hidden button so tests can
  // trigger a "background refresh" by clicking it.
  const triggerRefresh = () => {
    // Simulate what AdminPanel does: create a brand-new object with the same
    // data (new reference, same values).
    setCachedData(makeCachedData(makeSettings()));
  };

  return (
    <>
      <button
        type="button"
        data-testid="simulate-refresh"
        onClick={triggerRefresh}
        style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0 }}
      >
        refresh
      </button>
      <SettingsTab
        cachedData={cachedData}
        isLoading={false}
        hasData={true}
        onMutated={onMutated ?? vi.fn()}
      />
    </>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Bug: unsaved edits wiped by cachedData prop change ──────────────────────

describe("SettingsTab — unsaved edits survive a cachedData prop update", () => {
  test("toggling a bool setting is still reflected after cachedData is replaced with an equivalent new object", async () => {
    render(
      <SettingsTabHarness initialCachedData={makeCachedData(makeSettings())} />,
    );

    // Wait for the first toggle (APP_DEBUG) to appear.
    const toggle = page.getByRole("switch").first();
    await expect.element(toggle).toBeInTheDocument();
    await expect.element(toggle).toHaveAttribute("aria-checked", "false");

    // User clicks the toggle — this is an unsaved local edit.
    await userEvent.click(toggle);
    await expect.element(toggle).toHaveAttribute("aria-checked", "true");

    // Simulate the background auto-refresh: trigger the hidden button which
    // replaces cachedData with a new object carrying the same values.
    const refreshBtn = page.getByTestId("simulate-refresh");
    await userEvent.click(refreshBtn);

    // BUG (before fix): the toggle would revert to "false" because fetchSettings
    // fired again and called setLocalVals({}).
    // EXPECTED (after fix): the toggle stays "true" — local edits are preserved.
    await expect.element(toggle).toHaveAttribute("aria-checked", "true");
  });

  test("unsaved int change survives a cachedData prop refresh", async () => {
    render(
      <SettingsTabHarness initialCachedData={makeCachedData(makeSettings())} />,
    );

    // Wait for the increase button of the int stepper to appear.
    const increaseBtn = page.getByRole("button", { name: /increase/i }).first();
    await expect.element(increaseBtn).toBeInTheDocument();

    // Click + once to change MESSAGE_MAX_CHARS from 2000 → 2001.
    await userEvent.click(increaseBtn);

    const numberInput = page.getByRole("spinbutton").first();
    await expect.element(numberInput).toHaveValue(2001);

    // Simulate background refresh.
    const refreshBtn = page.getByTestId("simulate-refresh");
    await userEvent.click(refreshBtn);

    // The edit should survive.
    await expect.element(numberInput).toHaveValue(2001);
  });
});

// ─── Unsaved changes indicator ────────────────────────────────────────────────

describe("SettingsTab — environment-locked settings", () => {
  test("keeps the control disabled while revealing the environment variable on hover", async () => {
    const envLockedSetting = {
      key: "SIGN_UP",
      label: "Allow registration",
      description: "Allow new users to register.",
      type: "bool",
      value: "true",
      defaultVal: "true",
      group: "registration",
      envLocked: true,
      nullable: false,
    };
    render(
      <SettingsTab
        cachedData={makeCachedData(makeSettings([envLockedSetting]))}
        isLoading={false}
        hasData={true}
        onMutated={vi.fn()}
      />,
    );

    const lockBadge = page.getByText("set in .env");
    await expect.element(lockBadge).toBeInTheDocument();
    await expect.element(page.getByRole("switch").last()).toBeDisabled();

    await userEvent.hover(lockBadge);
    await expect.element(page.getByRole("tooltip")).toHaveTextContent("SIGN_UP");
    await expect.element(page.getByRole("tooltip")).toBeVisible();
  });
});

describe("SettingsTab — unsaved changes indicator", () => {
  test("shows unsaved changes count after editing a toggle", async () => {
    render(
      <SettingsTabHarness initialCachedData={makeCachedData(makeSettings())} />,
    );

    // Initially no unsaved changes banner.
    await expect.element(page.getByText(/unsaved change/i)).not.toBeInTheDocument();

    // Toggle the first switch.
    const toggle = page.getByRole("switch").first();
    await expect.element(toggle).toBeInTheDocument();
    await userEvent.click(toggle);

    // Should now show "1 unsaved change".
    await expect.element(page.getByText(/1 unsaved change/i)).toBeInTheDocument();
  });

  test("unsaved changes indicator stays absent after cachedData refresh with no edits", async () => {
    render(
      <SettingsTabHarness initialCachedData={makeCachedData(makeSettings())} />,
    );

    // Wait for the component to be ready.
    await expect.element(page.getByRole("switch").first()).toBeInTheDocument();

    // Simulate a background refresh without making any edits.
    const refreshBtn = page.getByTestId("simulate-refresh");
    await userEvent.click(refreshBtn);

    // No unsaved indicator should appear.
    await expect.element(page.getByText(/unsaved change/i)).not.toBeInTheDocument();
  });
});
