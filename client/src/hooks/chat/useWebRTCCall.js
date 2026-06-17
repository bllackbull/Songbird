import { useCallback, useEffect, useRef, useState } from "react";

// WebRTC signaling runs over the existing SSE + HTTP infrastructure. Outgoing
// signals are sent with plain POST requests; incoming signals arrive through the
// shared SSE stream and are handed to `handleSignal` by the chat events hook.
async function postCallSignal(path, body) {
  try {
    const res = await fetch(`/api/calls/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body || {}),
    });
    return res.ok ? await res.json().catch(() => ({})) : null;
  } catch (err) {
    console.error(`Call signal '${path}' failed:`, err);
    return null;
  }
}

/**
 * Call states: idle | calling | ringing | connected
 */
export function useWebRTCCall() {
  const [callState, setCallState] = useState("idle");
  const [callType, setCallType] = useState("voice"); // voice | video
  const [callChatId, setCallChatId] = useState(null);
  const [callPeer, setCallPeer] = useState(null); // { username, nickname, avatar }
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);

  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const durationTimerRef = useRef(null);
  const iceServersRef = useRef([]);
  const pendingCandidatesRef = useRef([]);

  // Mirrors of state used inside stable callbacks (SSE handler, RTCPeerConnection
  // event handlers) so they never read stale values or force re-subscription.
  const callStateRef = useRef("idle");
  const callTypeRef = useRef("voice");
  const callChatIdRef = useRef(null);
  // Breaks the createPeerConnection -> endCall reference cycle: the connection
  // state handler calls the latest endCall via this ref instead of closing over
  // it before it is declared.
  const endCallRef = useRef(() => {});

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);
  useEffect(() => {
    callTypeRef.current = callType;
  }, [callType]);
  useEffect(() => {
    callChatIdRef.current = callChatId;
  }, [callChatId]);

  const cleanup = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    remoteStreamRef.current = null;
    pendingCandidatesRef.current = [];
    setCallDuration(0);
    setIsMuted(false);
    setIsCameraOff(false);
  }, []);

  const resetCallState = useCallback(() => {
    setCallState("idle");
    callStateRef.current = "idle";
    setCallChatId(null);
    callChatIdRef.current = null;
    setCallPeer(null);
    cleanup();
  }, [cleanup]);

  const flushPendingCandidates = useCallback(async (pc) => {
    const pending = pendingCandidatesRef.current;
    pendingCandidatesRef.current = [];
    for (const candidate of pending) {
      try {
        await pc.addIceCandidate(candidate);
      } catch (err) {
        console.error("Failed to add ICE candidate:", err);
      }
    }
  }, []);

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });

    pc.onicecandidate = (event) => {
      if (event.candidate && callChatIdRef.current) {
        void postCallSignal("ice-candidate", {
          chatId: callChatIdRef.current,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      remoteStreamRef.current = event.streams[0];
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setCallState("connected");
        callStateRef.current = "connected";
        if (!durationTimerRef.current) {
          durationTimerRef.current = setInterval(() => {
            setCallDuration((prev) => prev + 1);
          }, 1000);
        }
      }
      if (
        pc.connectionState === "disconnected" ||
        pc.connectionState === "failed"
      ) {
        endCallRef.current();
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  }, []);

  // Start a call (caller)
  const startCall = useCallback(
    async ({ chatId, calleeUsername, type = "voice" }) => {
      const numericChatId = Number(chatId);
      if (!numericChatId || !calleeUsername) return;

      setCallState("calling");
      callStateRef.current = "calling";
      setCallType(type);
      callTypeRef.current = type;
      setCallChatId(numericChatId);
      callChatIdRef.current = numericChatId;
      setCallPeer({ username: calleeUsername });

      const data = await postCallSignal("start", {
        chatId: numericChatId,
        calleeUsername,
        type,
      });
      if (!data) {
        resetCallState();
        return;
      }
      iceServersRef.current = data.iceServers || [];
    },
    [resetCallState],
  );

  // Accept incoming call (callee)
  const acceptCall = useCallback(async () => {
    const chatId = callChatIdRef.current;
    if (!chatId) return;

    setCallState("connected");
    callStateRef.current = "connected";
    await postCallSignal("accept", { chatId });

    const pc = createPeerConnection();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callTypeRef.current === "video",
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    } catch (err) {
      console.error("Failed to get media:", err);
      endCallRef.current();
    }
  }, [createPeerConnection]);

  // Reject incoming call
  const rejectCall = useCallback(async () => {
    const chatId = callChatIdRef.current;
    resetCallState();
    if (chatId) await postCallSignal("reject", { chatId });
  }, [resetCallState]);

  // End active call
  const endCall = useCallback(async () => {
    const chatId = callChatIdRef.current;
    resetCallState();
    if (chatId) await postCallSignal("end", { chatId });
  }, [resetCallState]);

  useEffect(() => {
    endCallRef.current = endCall;
  }, [endCall]);

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
    setIsMuted((prev) => !prev);
  }, []);

  const toggleCamera = useCallback(() => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getVideoTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
    setIsCameraOff((prev) => !prev);
  }, []);

  // Handle a signaling message delivered over the SSE stream.
  const handleSignal = useCallback(
    async (payload) => {
      if (!payload?.type) return;
      switch (payload.type) {
        case "call:incoming": {
          // Busy: auto-reject a second incoming call.
          if (callStateRef.current !== "idle") {
            void postCallSignal("reject", { chatId: payload.chatId });
            return;
          }
          setCallState("ringing");
          callStateRef.current = "ringing";
          setCallType(payload.callType || "voice");
          callTypeRef.current = payload.callType || "voice";
          setCallChatId(payload.chatId);
          callChatIdRef.current = payload.chatId;
          setCallPeer({
            username: payload.callerUsername,
            nickname: payload.callerNickname,
            avatar: payload.callerAvatar,
          });
          iceServersRef.current = payload.iceServers || [];
          break;
        }
        case "call:accepted": {
          // Caller creates the offer once the callee accepts.
          const pc = createPeerConnection();
          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              audio: true,
              video: callTypeRef.current === "video",
            });
            localStreamRef.current = stream;
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = stream;
            }
            stream.getTracks().forEach((track) => pc.addTrack(track, stream));
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await postCallSignal("offer", {
              chatId: callChatIdRef.current,
              offer,
            });
          } catch (err) {
            console.error("Failed to create offer:", err);
            endCallRef.current();
          }
          break;
        }
        case "call:rejected":
        case "call:ended": {
          resetCallState();
          break;
        }
        case "call:offer": {
          const pc = peerConnectionRef.current;
          if (!pc) return;
          await pc.setRemoteDescription(
            new RTCSessionDescription(payload.offer),
          );
          await flushPendingCandidates(pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await postCallSignal("answer", { chatId: payload.chatId, answer });
          break;
        }
        case "call:answer": {
          const pc = peerConnectionRef.current;
          if (!pc) return;
          await pc.setRemoteDescription(
            new RTCSessionDescription(payload.answer),
          );
          await flushPendingCandidates(pc);
          break;
        }
        case "call:ice-candidate": {
          const pc = peerConnectionRef.current;
          const candidate = new RTCIceCandidate(payload.candidate);
          if (!pc || !pc.remoteDescription) {
            pendingCandidatesRef.current.push(candidate);
            return;
          }
          try {
            await pc.addIceCandidate(candidate);
          } catch (err) {
            console.error("Failed to add ICE candidate:", err);
          }
          break;
        }
        default:
          break;
      }
    },
    [createPeerConnection, resetCallState, flushPendingCandidates],
  );

  // End any active call when the component unmounts.
  useEffect(() => cleanup, [cleanup]);

  return {
    callState,
    callType,
    callChatId,
    callPeer,
    callDuration,
    isMuted,
    isCameraOff,
    localVideoRef,
    remoteVideoRef,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleCamera,
    handleSignal,
  };
}
