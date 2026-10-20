import { isValidUuid } from "./uuidUtils.js";

/**
 * Manages 1-on-1 WebRTC voice and video calls in-memory.
 */
export function createCallManager(deps) {
  const {
    isMember,
    findChatById,
    listChatMembers,
    findUserById,
    emitToUser,
    sendPushNotificationToUsers,
    createCallMessage,
    updateCallMessageBody,
    emitChatEvent,
    env = process.env,
  } = deps;

  // chatId (UUID) -> { chatId, callerId, callerUsername, calleeId, calleeUsername, type, startedAt, status }
  const activeCalls = new Map();

  const TURN_STUN_URL = env.TURN_STUN_URL || "stun:stun.l.google.com:19302";
  const TURN_URL = env.TURN_URL || "";
  const TURN_USERNAME = env.TURN_USERNAME || "";
  const TURN_CREDENTIAL = env.TURN_CREDENTIAL || "";

  function getIceServers() {
    const servers = [{ urls: TURN_STUN_URL }];
    if (TURN_URL) {
      servers.push({
        urls: TURN_URL,
        username: TURN_USERNAME,
        credential: TURN_CREDENTIAL,
      });
    }
    return servers;
  }

  function sendCallPush(userIds, payload) {
    if (typeof sendPushNotificationToUsers !== "function") return;
    try {
      void Promise.resolve(
        sendPushNotificationToUsers(userIds, payload),
      ).catch(() => {
        // Push must never break call flow; realtime emit is the source of truth.
      });
    } catch {
      // ignore synchronous throw
    }
  }

  function dismissCallPush(call) {
    if (!call || call.status !== "ringing") return;
    sendCallPush([call.calleeId], {
      data: { callPush: "dismiss", chatId: call.chatId },
    });
  }

  function getActiveCall(chatId) {
    if (!chatId) return undefined;
    return activeCalls.get(String(chatId).toLowerCase());
  }

  function isParticipant(call, username) {
    if (!call || !username) return false;
    const lower = String(username).toLowerCase();
    return (
      String(call.callerUsername).toLowerCase() === lower ||
      String(call.calleeUsername).toLowerCase() === lower
    );
  }

  function encodeCallBody(type, status, durationSeconds = null) {
    return durationSeconds == null
      ? `[[call:${type}:${status}]]`
      : `[[call:${type}:${status}:${Math.max(0, Math.floor(Number(durationSeconds) || 0))}]]`;
  }

  // Call-log messages.
  function emitLogUpdate(call) {
    if (typeof emitChatEvent !== "function" || !call?.logMessageId) return;
    emitChatEvent(call.chatId, {
      type: "chat_message_updated",
      chatId: call.chatId,
      messageId: call.logMessageId,
      body: encodeCallBody(call.type, call.logStatus, call.logDuration),
    });
  }

  async function writeCallLog(call, status, durationSeconds = null) {
    call.logStatus = status;
    call.logDuration = durationSeconds;
    if (call.logMessageId) {
      if (typeof updateCallMessageBody === "function") {
        try {
          await updateCallMessageBody(call.logMessageId, encodeCallBody(call.type, status, durationSeconds));
        } catch {
          // ignore; realtime emit is the source of truth
        }
      }
      emitLogUpdate(call);
      return;
    }
    if (typeof createCallMessage !== "function") return;
    try {
      const id = await createCallMessage(call.chatId, call.callerId, encodeCallBody(call.type, status, durationSeconds));
      if (id) {
        call.logMessageId = id;
        if (typeof emitChatEvent === "function") {
          emitChatEvent(call.chatId, {
            type: "chat_message",
            chatId: call.chatId,
            messageId: id,
            userId: call.callerId,
            username: call.callerUsername,
            body: encodeCallBody(call.type, status, durationSeconds),
          });
        }
      }
    } catch {
      // ignore
    }
  }

  function peerUsernameOf(call, username) {
    const lower = String(username).toLowerCase();
    return String(call.callerUsername).toLowerCase() === lower
      ? call.calleeUsername
      : call.callerUsername;
  }

  async function startCall({ user, chatId, type = "voice" }) {
    if (!user?.username) {
      return { status: 401, error: "Not authenticated" };
    }
    const normalizedChatId = String(chatId || "").trim();
    if (!isValidUuid(normalizedChatId)) {
      return { status: 400, error: "Invalid chat ID" };
    }

    const chat =
      typeof findChatById === "function"
        ? await findChatById(normalizedChatId)
        : null;
    if (!chat) {
      return { status: 404, error: "Chat not found" };
    }
    if (chat.type !== "dm") {
      return {
        status: 400,
        error: "Calls are only supported in direct messages",
      };
    }

    const memberCheck =
      typeof isMember === "function"
        ? await isMember(normalizedChatId, user.id)
        : false;
    if (!memberCheck) {
      return { status: 403, error: "You are not a member of this chat" };
    }

    const key = normalizedChatId.toLowerCase();
    if (activeCalls.has(key)) {
      return { status: 409, error: "Call already in progress in this chat" };
    }

    const members =
      typeof listChatMembers === "function"
        ? await listChatMembers(normalizedChatId)
        : [];
    const otherMember = members.find(
      (m) =>
        String(m.username).toLowerCase() !==
        String(user.username).toLowerCase(),
    );
    if (!otherMember?.username) {
      return { status: 404, error: "Other participant not found" };
    }

    const callee =
      typeof findUserById === "function"
        ? await findUserById(otherMember.id)
        : otherMember;
    if (!callee || callee.is_deleted || callee.username === "deleted") {
      return { status: 400, error: "Cannot call a deleted user" };
    }

    const call = {
      chatId: normalizedChatId,
      callerId: user.id,
      callerUsername: user.username,
      calleeId: otherMember.id,
      calleeUsername: otherMember.username,
      type: type === "video" ? "video" : "voice",
      startedAt: Date.now(),
      status: "ringing",
    };

    activeCalls.set(key, call);

    if (typeof emitToUser === "function") {
      emitToUser(otherMember.username, {
        type: "call:incoming",
        chatId: normalizedChatId,
        callType: call.type,
        caller: {
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          avatarUrl: user.avatar_url,
          color: user.color || null,
          verified: Boolean(user.verified),
          role: user.role || "user",
        },
      });
    }

    sendCallPush([callee.id], {
      title: `Incoming ${call.type} call from ${user.nickname || user.username}`,
      body: "Tap to answer",
      data: {
        callPush: "incoming",
        chatId: normalizedChatId,
        callType: call.type,
        url: "/",
      },
    });

    await writeCallLog(call, "outgoing");

    return { status: 200, call };
  }

  // Lets a client that opens the app after the call started discover it.
  async function getIncomingCallForUser(username) {
    if (!username) return null;
    const lower = String(username).toLowerCase();
    for (const call of activeCalls.values()) {
      if (call.status !== "ringing") continue;
      if (String(call.calleeUsername).toLowerCase() !== lower) continue;
      const caller =
        typeof findUserById === "function"
          ? await findUserById(call.callerId)
          : null;
      return {
        type: "call:incoming",
        chatId: call.chatId,
        callType: call.type,
        caller: {
          id: call.callerId,
          username: call.callerUsername,
          nickname: caller?.nickname || call.callerUsername,
          avatarUrl: caller?.avatar_url || "",
          color: caller?.color || null,
          verified: Boolean(caller?.verified),
          role: caller?.role || "user",
        },
      };
    }
    return null;
  }

  async function acceptCall({ user, chatId }) {
    if (!user?.username) {
      return { status: 401, error: "Not authenticated" };
    }
    const key = String(chatId || "").toLowerCase();
    const call = activeCalls.get(key);
    if (!call) {
      return { status: 404, error: "No active call found for this chat" };
    }

    if (
      String(user.username).toLowerCase() !==
      String(call.calleeUsername).toLowerCase()
    ) {
      return { status: 403, error: "Only the recipient can accept the call" };
    }

    dismissCallPush(call);

    call.status = "connected";

    if (typeof emitToUser === "function") {
      emitToUser(call.callerUsername, {
        type: "call:accepted",
        chatId: call.chatId,
      });
    }

    return { status: 200, call };
  }

  async function rejectCall({ user, chatId }) {
    if (!user?.username) {
      return { status: 401, error: "Not authenticated" };
    }
    const key = String(chatId || "").toLowerCase();
    const call = activeCalls.get(key);
    if (!call) {
      return { status: 404, error: "No active call found for this chat" };
    }

    if (!isParticipant(call, user.username)) {
      return { status: 403, error: "You are not a participant in this call" };
    }

    activeCalls.delete(key);

    dismissCallPush(call);

    const peer = peerUsernameOf(call, user.username);
    if (typeof emitToUser === "function" && peer) {
      emitToUser(peer, {
        type: "call:rejected",
        chatId: call.chatId,
      });
    }

    // Callee declined while ringing -> the caller's attempt failed.
    if (
      call.status === "ringing" &&
      String(user.username).toLowerCase() ===
        String(call.calleeUsername).toLowerCase()
    ) {
      await writeCallLog(call, "failed");
    }

    return { status: 200, ok: true };
  }

  async function endCall({ user, chatId }) {
    if (!user?.username) {
      return { status: 401, error: "Not authenticated" };
    }
    const key = String(chatId || "").toLowerCase();
    const call = activeCalls.get(key);
    if (!call) {
      return { status: 404, error: "No active call found for this chat" };
    }

    if (!isParticipant(call, user.username)) {
      return { status: 403, error: "You are not a participant in this call" };
    }

    const endedRinging = call.status === "ringing";
    const wasCaller =
      String(user.username).toLowerCase() ===
      String(call.callerUsername).toLowerCase();

    activeCalls.delete(key);

    dismissCallPush(call);

    const peer = peerUsernameOf(call, user.username);
    if (typeof emitToUser === "function" && peer) {
      emitToUser(peer, {
        type: "call:ended",
        chatId: call.chatId,
      });
    }

    if (endedRinging) {
      // Caller hung up before an answer -> cancelled; anything else (callee
      // hung up / dropped while ringing) -> failed attempt.
      await writeCallLog(call, wasCaller ? "cancelled" : "failed");
    } else if (call.logMessageId) {
      await writeCallLog(call, "connected", secondsSinceStart(call));
    }

    return { status: 200, ok: true };
  }

  async function relaySignal({ user, chatId, signalType, payload = {} }) {
    if (!user?.username) {
      return { status: 401, error: "Not authenticated" };
    }
    const key = String(chatId || "").toLowerCase();
    const call = activeCalls.get(key);
    if (!call) {
      return { status: 404, error: "No active call found for this chat" };
    }

    if (!isParticipant(call, user.username)) {
      return { status: 403, error: "You are not a participant in this call" };
    }

    const peer = peerUsernameOf(call, user.username);
    if (typeof emitToUser === "function" && peer) {
      emitToUser(peer, {
        type: `call:${signalType}`,
        chatId: call.chatId,
        ...payload,
      });
    }

    return { status: 200, ok: true };
  }

  function secondsSinceStart(call) {
    return Math.max(0, Math.round((Date.now() - Number(call.startedAt || 0)) / 1000));
  }

  function cleanupUserCalls(username) {
    if (!username) return;
    const lower = String(username).toLowerCase();
    for (const [key, call] of activeCalls.entries()) {
      if (
        String(call.callerUsername).toLowerCase() === lower ||
        String(call.calleeUsername).toLowerCase() === lower
      ) {
        activeCalls.delete(key);

        dismissCallPush(call);

        const wasCaller =
          String(call.callerUsername).toLowerCase() === lower;
        // Session dropped during ringing: caller vanishing -> cancelled,
        // callee vanishing -> failed. Drops mid-call keep "connected".
        if (call.status === "ringing") {
          void writeCallLog(call, wasCaller ? "cancelled" : "failed");
        } else if (call.logMessageId) {
          void writeCallLog(call, "connected", secondsSinceStart(call));
        }

        const peer = peerUsernameOf(call, lower);
        if (typeof emitToUser === "function" && peer) {
          emitToUser(peer, {
            type: "call:ended",
            chatId: call.chatId,
          });
        }
      }
    }
  }

  return {
    getIceServers,
    getActiveCall,
    getIncomingCallForUser,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    relaySignal,
    cleanupUserCalls,
  };
}
