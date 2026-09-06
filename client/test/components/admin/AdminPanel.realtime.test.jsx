import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import AdminPanel from "../../../src/components/admin/AdminPanel.jsx";

describe("AdminPanel — Real-time Updates", () => {
  test("subscribes to songbird:realtime-event and triggers debounced refresh without background polling", async () => {
    const fetchSpy = vi.fn().mockImplementation((url) => {
      if (url.includes("/api/admin/stats")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ totalUsers: 10, onlineUsers: 2 }),
        });
      }
      if (url.includes("/api/admin/system")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              memory: {
                systemUsed: 100,
                systemTotal: 1000,
                heapUsed: 50,
                heapTotal: 500,
              },
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal("fetch", fetchSpy);

    render(<AdminPanel user={{ role: "admin" }} onBack={() => {}} />);

    // Wait for initial mount fetch of /api/admin/stats
    await new Promise((r) => setTimeout(r, 50));
    const initialCalls = fetchSpy.mock.calls.filter((c) =>
      String(c[0]).includes("/api/admin/stats"),
    ).length;
    expect(initialCalls).toBeGreaterThanOrEqual(1);

    // Dispatch realtime event
    window.dispatchEvent(
      new CustomEvent("songbird:realtime-event", {
        detail: { type: "presence_update", username: "bob", status: "online" },
      }),
    );

    // Wait for the 300ms debounce timer to fire
    await new Promise((r) => setTimeout(r, 400));

    const updatedCalls = fetchSpy.mock.calls.filter((c) =>
      String(c[0]).includes("/api/admin/stats"),
    ).length;
    expect(updatedCalls).toBeGreaterThan(initialCalls);
  });
});
