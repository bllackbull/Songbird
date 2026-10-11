import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isCallSupported } from "../../src/utils/callCapabilities.js";

describe("isCallSupported", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false in non-browser environment where window is undefined", () => {
    vi.stubGlobal("window", undefined);
    expect(isCallSupported()).toBe(false);
  });

  it("returns false when isSecureContext is false", () => {
    vi.stubGlobal("window", {
      isSecureContext: false,
      location: { protocol: "https:", hostname: "example.com" },
    });
    expect(isCallSupported()).toBe(false);
  });

  it("returns false on insecure HTTP remote origin", () => {
    vi.stubGlobal("window", {
      isSecureContext: true,
      location: { protocol: "http:", hostname: "192.168.1.100" },
    });
    expect(isCallSupported()).toBe(false);
  });

  it("returns true on localhost with mediaDevices", () => {
    vi.stubGlobal("window", {
      isSecureContext: true,
      location: { protocol: "http:", hostname: "localhost" },
    });
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: () => Promise.resolve() },
    });
    expect(isCallSupported()).toBe(true);
  });

  it("returns true on HTTPS with mediaDevices", () => {
    vi.stubGlobal("window", {
      isSecureContext: true,
      location: { protocol: "https:", hostname: "songbird.example.com" },
    });
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: () => Promise.resolve() },
    });
    expect(isCallSupported()).toBe(true);
  });
});
