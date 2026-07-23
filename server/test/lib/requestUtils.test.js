import { describe, test, expect } from "vitest";
import {
  isLoopbackRequest,
  parseUploadFileMetadata,
} from "../../lib/requestUtils.js";

// Minimal request stub — only the socket.remoteAddress field matters.
const makeReq = (remoteAddress) => ({ socket: { remoteAddress } });

describe("isLoopbackRequest", () => {
  test("returns true for IPv6 loopback ::1", () => {
    expect(isLoopbackRequest(makeReq("::1"))).toBe(true);
  });

  test("returns true for IPv4 loopback 127.0.0.1", () => {
    expect(isLoopbackRequest(makeReq("127.0.0.1"))).toBe(true);
  });

  test("returns true for IPv4-mapped loopback ::ffff:127.0.0.1", () => {
    expect(isLoopbackRequest(makeReq("::ffff:127.0.0.1"))).toBe(true);
  });

  test("returns false for a regular IPv4 address", () => {
    expect(isLoopbackRequest(makeReq("192.168.1.100"))).toBe(false);
  });

  test("returns false for a public IPv6 address", () => {
    expect(isLoopbackRequest(makeReq("2001:db8::1"))).toBe(false);
  });

  test("returns false when remoteAddress is undefined", () => {
    expect(isLoopbackRequest({ socket: {} })).toBe(false);
  });

  test("returns false when socket is missing", () => {
    expect(isLoopbackRequest({})).toBe(false);
  });

  test("returns false for a spoofed loopback in a forwarded header (socket address used, not req.ip)", () => {
    const req = { socket: { remoteAddress: "203.0.113.5" }, ip: "127.0.0.1" };
    expect(isLoopbackRequest(req)).toBe(false);
  });
});

describe("parseUploadFileMetadata", () => {
  test("returns empty array for null", () => {
    expect(parseUploadFileMetadata(null)).toEqual([]);
  });

  test("returns empty array for undefined", () => {
    expect(parseUploadFileMetadata(undefined)).toEqual([]);
  });

  test("returns empty array for empty string", () => {
    expect(parseUploadFileMetadata("")).toEqual([]);
  });

  test("returns empty array for invalid JSON", () => {
    expect(parseUploadFileMetadata("not json")).toEqual([]);
  });

  test("returns empty array when JSON value is not an array", () => {
    expect(parseUploadFileMetadata('{"foo":"bar"}')).toEqual([]);
    expect(parseUploadFileMetadata('"a string"')).toEqual([]);
    expect(parseUploadFileMetadata("42")).toEqual([]);
  });

  test("returns the parsed array for valid JSON array", () => {
    const input = JSON.stringify([{ name: "file.txt", size: 1024 }]);
    expect(parseUploadFileMetadata(input)).toEqual([
      { name: "file.txt", size: 1024 },
    ]);
  });

  test("returns an empty array for an empty JSON array", () => {
    expect(parseUploadFileMetadata("[]")).toEqual([]);
  });

  test("preserves multiple entries", () => {
    const files = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(parseUploadFileMetadata(JSON.stringify(files))).toEqual(files);
  });
});
