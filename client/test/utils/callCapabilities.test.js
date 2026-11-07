import { describe, it, expect, afterEach, vi } from "vitest";
import {
  isCallSupported,
  isScreenShareSupported,
  foldIncomingRemoteStream,
} from "../../src/utils/callCapabilities.js";

class FakeMediaStream {
  constructor(tracks = []) {
    this._tracks = [...tracks];
  }
  getTracks() {
    return this._tracks;
  }
  addTrack(track) {
    this._tracks.push(track);
  }
}

describe("foldIncomingRemoteStream", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the existing stream when screen-share audio arrives on its own stream", () => {
    // Regression: replacing the stream would silence the peer's mic.
    const mic = { kind: "audio" };
    const remote = new FakeMediaStream([mic]);
    const screenAudio = { kind: "audio" };
    const ownStream = new FakeMediaStream([screenAudio]);
    vi.stubGlobal("MediaStream", FakeMediaStream);

    const result = foldIncomingRemoteStream(
      { track: screenAudio, streams: [ownStream] },
      remote,
    );
    expect(result).toBe(remote);
    expect(result.getTracks().includes(screenAudio)).toBe(true);
  });

  it("replaces the stream for screen-share video on its own stream", () => {
    const screenVideo = { kind: "video" };
    const ownStream = new FakeMediaStream([screenVideo]);
    const result = foldIncomingRemoteStream(
      { track: screenVideo, streams: [ownStream] },
      new FakeMediaStream(),
    );
    expect(result).toBe(ownStream);
  });

  it("folds unassociated tracks into the current stream", () => {
    const track = { kind: "video" };
    const remote = new FakeMediaStream();
    const result = foldIncomingRemoteStream({ track, streams: [] }, remote);
    expect(result).toBe(remote);
  });

  it("starts a fresh stream when none exists yet", () => {
    const track = { kind: "audio" };
    const ownStream = new FakeMediaStream([track]);
    const result = foldIncomingRemoteStream(
      { track, streams: [ownStream] },
      null,
    );
    expect(result).toBe(ownStream);
  });
});

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
