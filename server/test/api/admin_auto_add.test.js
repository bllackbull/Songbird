import { describe, test, expect } from "vitest";
import request from "supertest";
import { makeApp } from "../helpers/makeApp.js";

const VALID_CHAT_ID = "c0000000-0000-4000-8000-000000000001";

describe("Admin Chat API - auto_add_new_users", () => {
  test("POST /api/admin/chats sets auto_add_new_users=1 when public and requested", async () => {
    let capturedOptions = null;
    const { app } = makeApp({
      deps: {
        getSessionFromRequest: () => ({
          id: "admin-1",
          username: "admin",
          role: "admin",
        }),
        isUserAdmin: () => true,
        findUserById: () => ({ id: "user-1", username: "user1" }),
        findUserByUsername: () => ({ id: "user-1", username: "user1" }),
        adminGetRow: () => null,
        createChat: (name, type, options) => {
          capturedOptions = options;
          return VALID_CHAT_ID;
        },
        findChatById: () => ({
          id: VALID_CHAT_ID,
          name: "Public Group",
          type: "group",
          group_visibility: "public",
          auto_add_new_users: 1,
        }),
      },
    });

    const res = await request(app).post("/api/admin/chats").send({
      type: "group",
      name: "Public Group",
      username: "publicgrp",
      visibility: "public",
      owner: "user-1",
      autoAddNewUsers: true,
    });

    expect(res.status).toBe(201);
    expect(capturedOptions).not.toBeNull();
    const autoAddVal =
      capturedOptions.autoAddNewUsers ?? capturedOptions.auto_add_new_users;
    expect(Boolean(autoAddVal)).toBe(true);
  });

  test("POST /api/admin/chats forces auto_add_new_users=0 when private", async () => {
    let capturedOptions = null;
    const { app } = makeApp({
      deps: {
        getSessionFromRequest: () => ({
          id: "admin-1",
          username: "admin",
          role: "admin",
        }),
        isUserAdmin: () => true,
        findUserById: () => ({ id: "user-1", username: "user1" }),
        findUserByUsername: () => ({ id: "user-1", username: "user1" }),
        adminGetRow: () => null,
        createChat: (name, type, options) => {
          capturedOptions = options;
          return VALID_CHAT_ID;
        },
        findChatById: () => ({
          id: VALID_CHAT_ID,
          name: "Private Group",
          type: "group",
          group_visibility: "private",
          auto_add_new_users: 0,
        }),
      },
    });

    const res = await request(app).post("/api/admin/chats").send({
      type: "group",
      name: "Private Group",
      username: "pvtgrp",
      visibility: "private",
      owner: "user-1",
      autoAddNewUsers: true,
    });

    expect(res.status).toBe(201);
    expect(capturedOptions).not.toBeNull();
    const autoAddVal =
      capturedOptions.autoAddNewUsers ?? capturedOptions.auto_add_new_users;
    expect(Boolean(autoAddVal)).toBe(false);
  });

  test("PATCH /api/admin/chats/:id forces auto_add_new_users=0 when switching to private", async () => {
    let capturedPayload = null;
    const { app } = makeApp({
      deps: {
        getSessionFromRequest: () => ({
          id: "admin-1",
          username: "admin",
          role: "admin",
        }),
        isUserAdmin: () => true,
        findChatById: () => ({
          id: VALID_CHAT_ID,
          name: "Group 1",
          type: "group",
          group_visibility: "public",
          auto_add_new_users: 1,
        }),
        adminGetRow: () => null,
        updateGroupChat: (id, payload) => {
          capturedPayload = payload;
          return 1;
        },
      },
    });

    const res = await request(app)
      .patch(`/api/admin/chats/${VALID_CHAT_ID}`)
      .send({
        visibility: "private",
      });

    expect(res.status).toBe(200);
    expect(capturedPayload).not.toBeNull();
    const autoAddVal =
      capturedPayload.autoAddNewUsers ?? capturedPayload.auto_add_new_users;
    expect(autoAddVal).toBe(0);
  });

  test("PATCH /api/admin/chats/:id updates auto_add_new_users when requested on public chat", async () => {
    let capturedPayload = null;
    const { app } = makeApp({
      deps: {
        getSessionFromRequest: () => ({
          id: "admin-1",
          username: "admin",
          role: "admin",
        }),
        isUserAdmin: () => true,
        findChatById: () => ({
          id: VALID_CHAT_ID,
          name: "Group 1",
          type: "group",
          group_visibility: "public",
          auto_add_new_users: 0,
        }),
        adminGetRow: () => null,
        updateGroupChat: (id, payload) => {
          capturedPayload = payload;
          return 1;
        },
      },
    });

    const res = await request(app)
      .patch(`/api/admin/chats/${VALID_CHAT_ID}`)
      .send({
        visibility: "public",
        autoAddNewUsers: true,
      });

    expect(res.status).toBe(200);
    expect(capturedPayload).not.toBeNull();
    const autoAddVal =
      capturedPayload.autoAddNewUsers ?? capturedPayload.auto_add_new_users;
    expect(Boolean(autoAddVal)).toBe(true);
  });
});
