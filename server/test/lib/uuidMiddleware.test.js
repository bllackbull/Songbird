import { describe, test, expect, vi } from "vitest";
import {
  validateUuidParams,
  validateUuidBody,
} from "../../lib/uuidMiddleware.js";

function createMockRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(data) {
      res.body = data;
      return res;
    },
  };
  return res;
}

describe("validateUuidParams", () => {
  const validUuid = "550e8400-e29b-41d4-a716-446655440000";

  test("calls next() when all params are valid UUIDs", () => {
    const middleware = validateUuidParams("chatId");
    const req = { params: { chatId: validUuid } };
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBeNull();
  });

  test("calls next() when multiple params are all valid UUIDs", () => {
    const middleware = validateUuidParams("chatId", "messageId");
    const req = {
      params: {
        chatId: validUuid,
        messageId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      },
    };
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test("returns 400 with param name when param is invalid UUID", () => {
    const middleware = validateUuidParams("chatId");
    const req = { params: { chatId: "not-a-uuid" } };
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Parameter 'chatId' is not a valid UUID.");
  });

  test("returns 400 with 'required' message when param is empty string", () => {
    const middleware = validateUuidParams("chatId");
    const req = { params: { chatId: "" } };
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Parameter 'chatId' is required.");
  });

  test("returns 400 with 'required' message when param is whitespace-only", () => {
    const middleware = validateUuidParams("chatId");
    const req = { params: { chatId: "   " } };
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Parameter 'chatId' is required.");
  });

  test("returns 400 with 'required' message when param is undefined", () => {
    const middleware = validateUuidParams("chatId");
    const req = { params: {} };
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Parameter 'chatId' is required.");
  });

  test("accepts uppercase hex in UUID (case-insensitive)", () => {
    const middleware = validateUuidParams("chatId");
    const req = { params: { chatId: "550E8400-E29B-41D4-A716-446655440000" } };
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBeNull();
  });

  test("accepts mixed-case UUID", () => {
    const middleware = validateUuidParams("chatId");
    const req = { params: { chatId: "550e8400-E29B-41d4-A716-446655440000" } };
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test("rejects on first invalid param when multiple are specified", () => {
    const middleware = validateUuidParams("chatId", "messageId");
    const req = {
      params: { chatId: "invalid", messageId: validUuid },
    };
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Parameter 'chatId' is not a valid UUID.");
  });

  test("rejects UUID-like string with wrong length", () => {
    const middleware = validateUuidParams("userId");
    const req = { params: { userId: "550e8400-e29b-41d4-a716-44665544000" } };
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Parameter 'userId' is not a valid UUID.");
  });
});

describe("validateUuidBody", () => {
  const validUuid = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

  test("calls next() when all required fields are valid UUIDs", () => {
    const middleware = validateUuidBody([{ field: "userId", required: true }]);
    const req = { body: { userId: validUuid } };
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBeNull();
  });

  test("returns 400 when required field is missing (undefined)", () => {
    const middleware = validateUuidBody([{ field: "userId", required: true }]);
    const req = { body: {} };
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Field 'userId' is required.");
  });

  test("returns 400 when required field is null", () => {
    const middleware = validateUuidBody([{ field: "userId", required: true }]);
    const req = { body: { userId: null } };
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Field 'userId' is required.");
  });

  test("returns 400 when required field is empty string", () => {
    const middleware = validateUuidBody([{ field: "userId", required: true }]);
    const req = { body: { userId: "" } };
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Field 'userId' is required.");
  });

  test("returns 400 when required field is whitespace-only", () => {
    const middleware = validateUuidBody([{ field: "userId", required: true }]);
    const req = { body: { userId: "   " } };
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Field 'userId' is required.");
  });

  test("skips optional field when undefined", () => {
    const middleware = validateUuidBody([
      { field: "replyToMessageId", required: false },
    ]);
    const req = { body: {} };
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test("skips optional field when null", () => {
    const middleware = validateUuidBody([
      { field: "replyToMessageId", required: false },
    ]);
    const req = { body: { replyToMessageId: null } };
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test("skips optional field when empty string", () => {
    const middleware = validateUuidBody([
      { field: "replyToMessageId", required: false },
    ]);
    const req = { body: { replyToMessageId: "" } };
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test("skips optional field when whitespace-only", () => {
    const middleware = validateUuidBody([
      { field: "replyToMessageId", required: false },
    ]);
    const req = { body: { replyToMessageId: "   " } };
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test("returns 400 when optional field has invalid UUID value", () => {
    const middleware = validateUuidBody([
      { field: "replyToMessageId", required: false },
    ]);
    const req = { body: { replyToMessageId: "not-valid" } };
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe(
      "Field 'replyToMessageId' is not a valid UUID.",
    );
  });

  test("accepts uppercase hex in body field UUID", () => {
    const middleware = validateUuidBody([{ field: "userId", required: true }]);
    const req = { body: { userId: "7C9E6679-7425-40DE-944B-E07FC1F90AE7" } };
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test("validates multiple fields independently", () => {
    const middleware = validateUuidBody([
      { field: "userId", required: true },
      { field: "chatId", required: true },
    ]);
    const req = {
      body: {
        userId: validUuid,
        chatId: "550e8400-e29b-41d4-a716-446655440000",
      },
    };
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test("rejects on first invalid field when multiple are specified", () => {
    const middleware = validateUuidBody([
      { field: "userId", required: true },
      { field: "chatId", required: true },
    ]);
    const req = { body: { userId: "bad", chatId: validUuid } };
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Field 'userId' is not a valid UUID.");
  });

  test("handles missing body gracefully", () => {
    const middleware = validateUuidBody([{ field: "userId", required: true }]);
    const req = {};
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Field 'userId' is required.");
  });

  test("handles body being undefined", () => {
    const middleware = validateUuidBody([{ field: "userId", required: true }]);
    const req = { body: undefined };
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Field 'userId' is required.");
  });
});
