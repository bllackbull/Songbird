import { useCallback, useEffect, useRef, useState } from "react";
import { fetchIceServers, sendCallSignal } from "../../api/chatApi.js";
import { isCallSupported } from "../../utils/callCapabilities.js";

/**
 * Call states: idle | calling | ringing | connected
 */
export function useWebRTCCall({ realtimeSenderRef } = {}) {
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

  // Mirrors of state used inside stable callbacks so they never read stale values
  const callStateRef = useRef(callState);
  const callTypeRef = useRef(callType);
  const callChatIdRef = useRef(callChatId);
  const endCallRef = useRef(null);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    callTypeRef.current = callType;
  }, [callType]);

  useEffect(() => {
    callChatIdRef.current = callChatId;
  }, [callChatId]);

  // Outgoing signal sender: prefers WebSocket if open, falls back to POST /api/calls/:action
  const postSignal = useCallback(
    async (path, body = {}) => {
      if (realtimeSenderRef?.current) {
        try {
          const sent = realtimeSenderRef.current({
            action: "call_signal",
            signalType: path,
            chatId: body.chatId,
            data: body,
          });
          if (sent) return { ok: true };
        } catch (_) {}
      }
      return await sendCallSignal(path, body);
    },
    [realtimeSenderRef]
  );

  // Fetch ICE servers once on mount
  useEffect(() => {
    let isCancelled = false;
    void fetchIceServers().then((servers) => {
      if (!isCancelled && Array.isArray(servers) && servers.length) {
        iceServersRef.current = servers;
      }
    });
    return () => {
      isCancelled = true;
    };
  }, []);

  const resetCallState = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach((t) => t.stop());
      remoteStreamRef.current = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    if (peerConnectionRef.current) {
      try {
        peerConnectionRef.current.close();
      } catch (_) {}
      peerConnectionRef.current = null;
    }

    pendingCandidatesRef.current = [];
    setCallState("idle");
    callStateRef.current = "idle";
    setCallChatId(null);
    callChatIdRef.current = null;
    setCallPeer(null);
    setCallDuration(0);
    setIsMuted(false);
    setIsCameraOff(false);
  }, []);

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });

    pc.onicecandidate = (event) => {
      if (event.candidate && callChatIdRef.current) {
        void postSignal("ice-candidate", {
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
        endCallRef.current?.();
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  }, [postSignal]);

  // Start a call (caller)
  const startCall = useCallback(
    async ({ chatId, calleeUsername, calleeNickname, calleeAvatar, type = "voice" }) => {
      const normalizedChatId = String(chatId || "").trim();
      if (!normalizedChatId || !calleeUsername) return;
      if (!isCallSupported()) {
        console.warn("Calls are only supported over secure HTTPS connections");
        return;
      }

      setCallState("calling");
      callStateRef.current = "calling";
      setCallType(type);
      callTypeRef.current = type;
      setCallChatId(normalizedChatId);
      callChatIdRef.current = normalizedChatId;
      setCallPeer({
        username: calleeUsername,
        nickname: calleeNickname,
        avatar: calleeAvatar,
      });

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: type === "video",
        });
        localStreamRef.current = stream;
        if (localVideoRef.current && type === "video") {
          localVideoRef.current.srcObject = stream;
        }

        const res = await postSignal("start", {
          chatId: normalizedChatId,
          type,
        });
        if (!res?.ok && !res?.call) {
          resetCallState();
        }
      } catch (err) {
        console.error("Failed to start call:", err);
        resetCallState();
      }
    },
    [postSignal, resetCallState]
  );

  // Accept incoming call (callee)
  const acceptCall = useCallback(async () => {
    const chatId = callChatIdRef.current;
    if (!chatId) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callTypeRef.current === "video",
      });
      localStreamRef.current = stream;
      if (localVideoRef.current && callTypeRef.current === "video") {
        localVideoRef.current.srcObject = stream;
      }

      const pc = createPeerConnection();
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // Process queued candidates
      while (pendingCandidatesRef.current.length > 0) {
        const cand = pendingCandidatesRef.current.shift();
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (_) {}
      }

      await postSignal("accept", { chatId });
    } catch (err) {
      console.error("Failed to accept call:", err);
      resetCallState();
      await postSignal("reject", { chatId });
    }
  }, [createPeerConnection, postSignal, resetCallState]);

  // Reject incoming call (callee)
  const rejectCall = useCallback(async () => {
    const chatId = callChatIdRef.current;
    resetCallState();
    if (chatId) await postSignal("reject", { chatId });
  }, [postSignal, resetCallState]);

  // End active call
  const endCall = useCallback(async () => {
    const chatId = callChatIdRef.current;
    resetCallState();
    if (chatId) await postSignal("end", { chatId });
  }, [postSignal, resetCallState]);

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

  // Handle incoming signaling messages
  const handleSignal = useCallback(
    async (payload) => {
      if (!payload?.type) return;

      switch (payload.type) {
        case "call:incoming": {
          // If this client does not support WebRTC / is on insecure HTTP, auto-reject without showing modal
          if (!isCallSupported()) {
            void postSignal("reject", { chatId: payload.chatId });
            return;
          }

          // Busy: reject second call if already active
          if (callStateRef.current !== "idle") {
            void postSignal("reject", { chatId: payload.chatId });
            return;
          }
          setCallState("ringing");
          callStateRef.current = "ringing";
          setCallType(payload.callType || "voice");
          callTypeRef.current = payload.callType || "voice";
          setCallChatId(String(payload.chatId));
          callChatIdRef.current = String(payload.chatId);
          setCallPeer({
            username: payload.caller?.username || payload.callerUsername,
            nickname: payload.caller?.nickname || payload.callerNickname,
            avatar: payload.caller?.avatarUrl || payload.callerAvatar,
          });
          break;
        }

        case "call:accepted": {
          if (
            callStateRef.current !== "calling" ||
            String(payload.chatId) !== String(callChatIdRef.current)
          ) {
            return;
          }
          try {
            const pc = createPeerConnection();
            if (localStreamRef.current) {
              localStreamRef.current
                .getTracks()
                .forEach((track) => pc.addTrack(track, localStreamRef.current));
            }
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await postSignal("offer", {
              chatId: callChatIdRef.current,
              sdp: offer,
            });
          } catch (err) {
            console.error("Failed to create offer:", err);
            resetCallState();
          }
          break;
        }

        case "call:offer": {
          if (
            callChatIdRef.current &&
            String(payload.chatId) !== String(callChatIdRef.current)
          ) {
            return;
          }
          const sdpOffer = payload.sdp || payload.offer;
          try {
            let pc = peerConnectionRef.current;
            if (!pc) {
              pc = createPeerConnection();
              if (localStreamRef.current) {
                localStreamRef.current
                  .getTracks()
                  .forEach((track) =>
                    pc.addTrack(track, localStreamRef.current)
                  );
              }
            }
            await pc.setRemoteDescription(new RTCSessionDescription(sdpOffer));

            // Flush queued ICE candidates
            while (pendingCandidatesRef.current.length > 0) {
              const cand = pendingCandidatesRef.current.shift();
              try {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
              } catch (_) {}
            }

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await postSignal("answer", {
              chatId: callChatIdRef.current,
              sdp: answer,
            });
          } catch (err) {
            console.error("Failed to handle offer:", err);
            resetCallState();
          }
          break;
        }

        case "call:answer": {
          if (
            callChatIdRef.current &&
            String(payload.chatId) !== String(callChatIdRef.current)
          ) {
            return;
          }
          const sdpAnswer = payload.sdp || payload.answer;
          try {
            const pc = peerConnectionRef.current;
            if (pc && pc.signalingState !== "closed") {
              await pc.setRemoteDescription(new RTCSessionDescription(sdpAnswer));
              while (pendingCandidatesRef.current.length > 0) {
                const cand = pendingCandidatesRef.current.shift();
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(cand));
                } catch (_) {}
              }
            }
          } catch (err) {
            console.error("Failed to handle answer:", err);
          }
          break;
        }

        case "call:ice-candidate": {
          if (
            callChatIdRef.current &&
            String(payload.chatId) !== String(callChatIdRef.current)
          ) {
            return;
          }
          const cand = payload.candidate;
          if (!cand) return;
          const pc = peerConnectionRef.current;
          if (pc && pc.remoteDescription && pc.signalingState !== "closed") {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            } catch (_) {}
          } else {
            pendingCandidatesRef.current.push(cand);
          }
          break;
        }

        case "call:rejected":
        case "call:ended": {
          if (
            callChatIdRef.current &&
            String(payload.chatId) !== String(callChatIdRef.current)
          ) {
            return;
          }
          resetCallState();
          break;
        }

        case "call:error": {
          if (
            callChatIdRef.current &&
            String(payload.chatId) === String(callChatIdRef.current)
          ) {
            resetCallState();
          }
          break;
        }

        default:
          break;
      }
    },
    [createPeerConnection, postSignal, resetCallState]
  );

  // Auto cleanup on unmount
  useEffect(() => {
    return () => {
      resetCallState();
    };
  }, [resetCallState]);

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
