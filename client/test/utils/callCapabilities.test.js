import { describe, it, expect, afterEach, vi } from "vitest";
import {
  isCallSupported,
  isScreenShareSupported,
} from "../../src/utils/callCapabilities.js";

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

describe("isScreenShareSupported", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const secureWindow = {
    isSecureContext: true,
    location: { protocol: "https:", hostname: "example.com" },
  };

  it("returns true when getDisplayMedia is available (desktop browsers)", () => {
    vi.stubGlobal("window", secureWindow);
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: () => Promise.resolve(),
        getDisplayMedia: () => Promise.resolve(),
      },
    });
    expect(isScreenShareSupported()).toBe(true);
  });

  it("returns false when getDisplayMedia is missing (most mobile browsers)", () => {
    vi.stubGlobal("window", secureWindow);
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: () => Promise.resolve() },
    });
    expect(isScreenShareSupported()).toBe(false);
  });

  it("returns false when calls themselves are unsupported", () => {
    vi.stubGlobal("window", {
      isSecureContext: true,
      location: { protocol: "http:", hostname: "192.168.1.100" },
    });
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: () => Promise.resolve(),
        getDisplayMedia: () => Promise.resolve(),
      },
    });
    expect(isScreenShareSupported()).toBe(false);
  });
});
