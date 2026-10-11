import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import "../../../src/index.css";
import AdminPanel from "../../../src/components/admin/AdminPanel.jsx";

const CURRENT_USER = {
  id: 1,
  username: "alice",
  nickname: "Alice",
  color: "#10b981",
  role: "owner",
};
const ITEMS_PER_PAGE = 25;

const users = Array.from({ length: ITEMS_PER_PAGE }, (_, index) => ({
  id: index + 2,
  username: `user${index + 1}`,
  nickname: `User ${index + 1}`,
  avatar_url: null,
  color: "#3b82f6",
  role: "user",
  verified: false,
  banned: false,
  online: false,
  created_at: "2024-01-01T00:00:00.000Z",
}));

const chats = Array.from({ length: ITEMS_PER_PAGE }, (_, index) => ({
  id: index + 1,
  name: `Chat ${index + 1}`,
  type: "group",
  group_username: `chat${index + 1}`,
  group_color: "#10b981",
  group_avatar_url: null,
  group_visibility: "public",
  verified: false,
  member_count: 3,
  message_count: 10,
  created_at: "2024-01-01T00:00:00.000Z",
}));

function mockFetch(url) {
  const path = String(url);
  const payload = path.includes("/api/admin/users")
    ? { users, total: ITEMS_PER_PAGE + 1 }
    : path.includes("/api/admin/chats")
      ? { chats, total: ITEMS_PER_PAGE + 1 }
      : path.includes("/api/admin/system")
        ? {
            memory: {
              systemUsed: 1,
              systemTotal: 2,
              heapUsed: 1,
              heapTotal: 2,
            },
            loadAvg: [0],
            cpuCount: 1,
            storage: {
              diskTotalBytes: 0,
              diskUsedBytes: 0,
              uploadsSizeBytes: 0,
            },
          }
        : path.includes("/api/admin/stats")
          ? {}
          : {};
  return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) });
}

async function openMobileTab(label) {
  const tabButton = page.getByRole("button", { name: label });
  await expect.element(tabButton).toBeInTheDocument();
  tabButton.element().click();
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

async function expectPaginationReachable(lastItemName) {
  const lastItem = page.getByText(lastItemName).first();
  await expect.element(lastItem).toBeInTheDocument();
  const scrollHost = lastItem.element().closest(".app-scroll");
  expect(scrollHost).not.toBeNull();

  scrollHost.scrollTop = scrollHost.scrollHeight;
  await new Promise((resolve) => requestAnimationFrame(resolve));

  const pagination = page.getByText(`1–${ITEMS_PER_PAGE}`).first();
  await expect.element(pagination).toBeInTheDocument();
  const hostBounds = scrollHost.getBoundingClientRect();
  const paginationBounds = pagination.element().getBoundingClientRect();
  expect(scrollHost.scrollTop).toBeGreaterThan(0);
  expect(paginationBounds.bottom).toBeLessThanOrEqual(hostBounds.bottom - 76);
}

describe("AdminPanel mobile scrolling", () => {
  beforeEach(async () => {
    await page.viewport(390, 844);
    vi.stubGlobal("fetch", vi.fn(mockFetch));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("keeps Users pagination above the PWA bottom area", async () => {
    render(
      <div style={{ height: "844px" }}>
        <AdminPanel user={CURRENT_USER} onBack={() => {}} />
      </div>,
    );
    await openMobileTab("Users");
    await expectPaginationReachable("User 25");
  });

  test("keeps Chats pagination above the PWA bottom area", async () => {
    render(
      <div style={{ height: "844px" }}>
        <AdminPanel user={CURRENT_USER} onBack={() => {}} />
      </div>,
    );
    await openMobileTab("Chats");
    await expectPaginationReachable("Chat 25");
  });
});
