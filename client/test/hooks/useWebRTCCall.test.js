import { describe, it, expect, vi } from "vitest";
import { gradeCallQuality } from "../../src/hooks/chat/useWebRTCCall.js";

describe("useWebRTCCall state machine and helper logic", () => {
  it("formats duration seconds into mm:ss accurately", () => {
    const formatDuration = (seconds) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    };

    expect(formatDuration(0)).toBe("00:00");
    expect(formatDuration(45)).toBe("00:45");
    expect(formatDuration(65)).toBe("01:05");
    expect(formatDuration(3600)).toBe("60:00");
  });

  it("handles incoming signal and populates peer details", () => {
    let callState = "idle";
    let callChatId = null;
    let callPeer = null;

    const handleSignal = (payload) => {
      if (payload.type === "call:incoming") {
        callState = "ringing";
        callChatId = payload.chatId;
        callPeer = {
          username: payload.caller?.username || payload.callerUsername,
          nickname: payload.caller?.nickname || payload.callerNickname,
          avatar: payload.caller?.avatarUrl || payload.callerAvatar,
        };
      }
    };

    handleSignal({
      type: "call:incoming",
      chatId: "550e8400-e29b-41d4-a716-446655440000",
      callType: "video",
      caller: {
        username: "bob",
        nickname: "Bob Smith",
        avatarUrl: "/avatars/bob.png",
      },
    });

    expect(callState).toBe("ringing");
    expect(callChatId).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(callPeer).toEqual({
      username: "bob",
      nickname: "Bob Smith",
      avatar: "/avatars/bob.png",
    });
  });

  it("prefers websocket sender over http fallback when available", async () => {
    const wsSend = vi.fn(() => true);
    const httpSend = vi.fn(async () => ({ ok: true }));

    const realtimeSenderRef = { current: wsSend };

    const sendSignal = async (action, body) => {
      if (realtimeSenderRef.current) {
        const sent = realtimeSenderRef.current({
          action: "call_signal",
          signalType: action,
          chatId: body.chatId,
          data: body,
        });
        if (sent) return { ok: true };
      }
      return await httpSend(action, body);
    };

    const res = await sendSignal("start", { chatId: "chat-1" });
    expect(res).toEqual({ ok: true });
    expect(wsSend).toHaveBeenCalled();
    expect(httpSend).not.toHaveBeenCalled();

    // Now test fallback when wsSend returns false
    wsSend.mockReturnValueOnce(false);
    await sendSignal("start", { chatId: "chat-1" });
    expect(httpSend).toHaveBeenCalledWith("start", { chatId: "chat-1" });
  });

  describe("gradeCallQuality", () => {
    it("returns 0 when no stats are available yet", () => {
      expect(gradeCallQuality(null, null)).toBe(0);
      expect(gradeCallQuality(undefined, undefined)).toBe(0);
    });

    it("grades excellent to bad from ping alone", () => {
      expect(gradeCallQuality(50, null)).toBe(4);
      expect(gradeCallQuality(150, null)).toBe(3);
      expect(gradeCallQuality(300, null)).toBe(2);
      expect(gradeCallQuality(800, null)).toBe(1);
    });

    it("grades excellent to bad from packet loss alone", () => {
      expect(gradeCallQuality(null, 0.2)).toBe(4);
      expect(gradeCallQuality(null, 2)).toBe(3);
      expect(gradeCallQuality(null, 5)).toBe(2);
      expect(gradeCallQuality(null, 15)).toBe(1);
    });

    it("lets the worse metric win", () => {
      expect(gradeCallQuality(50, 15)).toBe(1);
      expect(gradeCallQuality(800, 0.2)).toBe(1);
      expect(gradeCallQuality(150, 0.2)).toBe(3);
    });
  });

  it("auto-rejects incoming call without ringing when call is not supported (e.g. insecure HTTP)", () => {
    let callState = "idle";
    const postSignal = vi.fn();
    const isCallSupported = () => false;

    const handleSignal = (payload) => {
      if (payload.type === "call:incoming") {
        if (!isCallSupported()) {
          postSignal("reject", { chatId: payload.chatId });
          return;
        }
        callState = "ringing";
      }
    };

    handleSignal({
      type: "call:incoming",
      chatId: "chat-uuid-1",
      callType: "voice",
    });

    expect(callState).toBe("idle");
    expect(postSignal).toHaveBeenCalledWith("reject", {
      chatId: "chat-uuid-1",
    });
  });
});
