import { useCallback, useEffect, useRef, useState } from "react";
import { fetchIceServers, sendCallSignal } from "../../api/chatApi.js";
import { isCallSupported } from "../../utils/callCapabilities.js";

/**
 * Grade connection quality from WebRTC stats into signal bars.
 * Returns 0 (unknown, no stats yet) through 4 (excellent).
 * When both metrics are present the worse one wins.
 */
export function gradeCallQuality(rttMs, lossPct) {
  const grades = [];
  if (Number.isFinite(rttMs)) {
    grades.push(rttMs < 100 ? 4 : rttMs < 200 ? 3 : rttMs < 400 ? 2 : 1);
  }
  if (Number.isFinite(lossPct)) {
    grades.push(lossPct < 1 ? 4 : lossPct < 3 ? 3 : lossPct < 8 ? 2 : 1);
  }
  if (grades.length === 0) return 0;
  return Math.min(...grades);
}

const UNKNOWN_QUALITY = { level: 0, rttMs: null, packetLossPct: null };

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
  const [isRemoteCameraOff, setIsRemoteCameraOff] = useState(true);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [remoteStreamTick, setRemoteStreamTick] = useState(0);
  const [callQuality, setCallQuality] = useState(UNKNOWN_QUALITY);

  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const durationTimerRef = useRef(null);
  const disconnectTimerRef = useRef(null);
  const iceServersRef = useRef([]);
  const pendingCandidatesRef = useRef([]);
  const iceStatsRef = useRef({ sent: 0, received: 0, applied: 0, queued: 0, sentTypes: {} });

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
    if (disconnectTimerRef.current) {
      clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = null;
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
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current.muted = false;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.muted = false;
    }

    if (peerConnectionRef.current) {
      try {
        peerConnectionRef.current.close();
      } catch (_) {}
      peerConnectionRef.current = null;
    }

    pendingCandidatesRef.current = [];
    setCallQuality(UNKNOWN_QUALITY);
    setCallState("idle");
    callStateRef.current = "idle";
    setCallChatId(null);
    callChatIdRef.current = null;
    setCallPeer(null);
    setCallDuration(0);
    setIsMuted(false);
    setIsCameraOff(false);
    setIsRemoteCameraOff(true);
    setIsSpeakerOn(true);
  }, []);

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });

    pc.onicecandidate = (event) => {
      if (event.candidate && callChatIdRef.current) {
        iceStatsRef.current.sent += 1;
        const t = event.candidate.type || "unknown";
        iceStatsRef.current.sentTypes[t] = (iceStatsRef.current.sentTypes[t] || 0) + 1;
        console.debug(`[call] ice candidate sent #${iceStatsRef.current.sent} type=${t}`);
        void postSignal("ice-candidate", {
          chatId: callChatIdRef.current,
          candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate,
        });
      } else if (!event.candidate) {
        console.debug(
          `[call] ice gathering complete, sent=${iceStatsRef.current.sent}, iceServers=${JSON.stringify(iceServersRef.current)}`,
        );
      }
    };

    pc.ontrack = (event) => {
      remoteStreamRef.current = event.streams[0];
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = event.streams[0];
        remoteAudioRef.current.play?.().catch(() => {});
      }
      setRemoteStreamTick((t) => t + 1);
    };

    pc.onconnectionstatechange = () => {
      console.debug(
        `[call] connectionState: ${pc.connectionState}, ice: ${pc.iceConnectionState}, signaling: ${pc.signalingState}, iceStats=${JSON.stringify(iceStatsRef.current)}`,
      );
      if (pc.connectionState === "connected") {
        if (disconnectTimerRef.current) {
          clearTimeout(disconnectTimerRef.current);
          disconnectTimerRef.current = null;
        }
        setCallState("connected");
        callStateRef.current = "connected";
        if (!durationTimerRef.current) {
          durationTimerRef.current = setInterval(() => {
            setCallDuration((prev) => prev + 1);
          }, 1000);
        }
      }
      if (pc.connectionState === "disconnected") {
        // Transient ICE blips are common; only hang up if it persists.
        if (!disconnectTimerRef.current) {
          disconnectTimerRef.current = setTimeout(() => {
            disconnectTimerRef.current = null;
            endCallRef.current?.();
          }, 5000);
        }
      }
      if (
        pc.connectionState === "failed" ||
        pc.connectionState === "closed"
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
      // Voice calls start with camera off, video calls with camera on.
      setIsCameraOff(type !== "video");
      setIsRemoteCameraOff(type !== "video");
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

  // Sync media streams onto media elements once they mount.
  useEffect(() => {
    if (callState !== "connected") return;
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
    if (remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
      remoteVideoRef.current.muted = !isSpeakerOn;
    }
    if (remoteAudioRef.current && remoteStreamRef.current) {
      remoteAudioRef.current.srcObject = remoteStreamRef.current;
      remoteAudioRef.current.muted = !isSpeakerOn;
      remoteAudioRef.current.play?.().catch(() => {});
    }
  }, [callState, callType, remoteStreamTick, isSpeakerOn]);

  // Sample WebRTC stats while connected to derive signal bars from
  // round-trip time (ping) and packet loss. Resets when the call ends.
  useEffect(() => {
    if (callState !== "connected") return undefined;
    let cancelled = false;
    const sample = async () => {
      const pc = peerConnectionRef.current;
      if (!pc || typeof pc.getStats !== "function") return;
      try {
        const stats = await pc.getStats();
        let rttMs = null;
        let fallbackRttMs = null;
        let lost = 0;
        let received = 0;
        stats.forEach((report) => {
          if (
            report.type === "candidate-pair" &&
            typeof report.currentRoundTripTime === "number"
          ) {
            const ms = report.currentRoundTripTime * 1000;
            if (report.nominated) {
              rttMs = ms;
            } else if (report.state === "succeeded" && fallbackRttMs == null) {
              fallbackRttMs = ms;
            }
          }
          if (report.type === "inbound-rtp" && report.isRemote !== true) {
            if (typeof report.packetsLost === "number") lost += report.packetsLost;
            if (typeof report.packetsReceived === "number")
              received += report.packetsReceived;
          }
        });
        if (rttMs == null) rttMs = fallbackRttMs;
        const total = lost + received;
        const packetLossPct = total > 0 ? (lost / total) * 100 : null;
        if (!cancelled) {
          setCallQuality({
            level: gradeCallQuality(rttMs, packetLossPct),
            rttMs,
            packetLossPct,
          });
        }
      } catch (_) {}
    };
    void sample();
    const interval = setInterval(sample, 2500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [callState]);

  // Accept incoming call (callee)
  const acceptCall = useCallback(async () => {
    const chatId = callChatIdRef.current;
    if (!chatId) return;

    try {
      const acceptedType = callTypeRef.current;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: acceptedType === "video",
      });
      localStreamRef.current = stream;
      // Voice calls start with camera off, video calls with camera on.
      setIsCameraOff(acceptedType !== "video");
      setIsRemoteCameraOff(acceptedType !== "video");

      const pc = createPeerConnection();
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // Process queued candidates
      while (pendingCandidatesRef.current.length > 0) {
        const cand = pendingCandidatesRef.current.shift();
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (_) {}
      }

      const res = await postSignal("accept", { chatId });
      if (res === null) {
        resetCallState();
        return;
      }

      // Move out of "ringing" immediately.
      setCallState("connected");
      callStateRef.current = "connected";
      if (!durationTimerRef.current) {
        durationTimerRef.current = setInterval(() => {
          setCallDuration((prev) => prev + 1);
        }, 1000);
      }
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

  // Speaker toggle: browsers have no earpiece route, so this controls whether
  // the remote peer is audible through the remote media elements.
  const toggleSpeaker = useCallback(() => {
    setIsSpeakerOn((prev) => !prev);
  }, []);

  const toggleCamera = useCallback(async () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length === 0) {
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
        const [videoTrack] = videoStream.getVideoTracks();
        if (!videoTrack) return;
        stream.addTrack(videoTrack);
        const pc = peerConnectionRef.current;
        if (pc && pc.signalingState !== "closed") {
          pc.addTrack(videoTrack, stream);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await postSignal("offer", {
            chatId: callChatIdRef.current,
            sdp: offer,
          });
        }
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        setCallType("video");
        callTypeRef.current = "video";
        setIsCameraOff(false);
        void postSignal("camera-state", {
          chatId: callChatIdRef.current,
          cameraOff: false,
        });
      } catch (err) {
        console.error("Failed to enable camera:", err);
      }
      return;
    }
    const nextOff = videoTracks.every((track) => track.enabled);
    videoTracks.forEach((track) => {
      track.enabled = !track.enabled;
    });
    setIsCameraOff(nextOff);
    if (nextOff === false) {
      setCallType("video");
      callTypeRef.current = "video";
    }
    void postSignal("camera-state", {
      chatId: callChatIdRef.current,
      cameraOff: nextOff,
    });
  }, [postSignal]);

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
          // Voice calls start with camera off, video calls with camera on.
          setIsCameraOff((payload.callType || "voice") !== "video");
          setIsRemoteCameraOff((payload.callType || "voice") !== "video");
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
          if (!sdpAnswer) break;
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
              // Handshake done: move caller out of "calling".
              setCallState("connected");
              callStateRef.current = "connected";
              if (!durationTimerRef.current) {
                durationTimerRef.current = setInterval(() => {
                  setCallDuration((prev) => prev + 1);
                }, 1000);
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
          iceStatsRef.current.received += 1;
          const pc = peerConnectionRef.current;
          if (pc && pc.remoteDescription && pc.signalingState !== "closed") {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
              iceStatsRef.current.applied += 1;
            } catch (err) {
              console.debug("[call] addIceCandidate failed:", err?.message || err);
            }
          } else {
            iceStatsRef.current.queued += 1;
            pendingCandidatesRef.current.push(cand);
          }
          break;
        }

        case "call:camera-state": {
          if (
            callChatIdRef.current &&
            String(payload.chatId) !== String(callChatIdRef.current)
          ) {
            return;
          }
          const remoteOff = payload.cameraOff !== false;
          setIsRemoteCameraOff(remoteOff);
          if (remoteOff === false) {
            setCallType("video");
            callTypeRef.current = "video";
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
    callQuality,
    isMuted,
    isCameraOff,
    isRemoteCameraOff,
    isSpeakerOn,
    localVideoRef,
    remoteVideoRef,
    remoteAudioRef,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleCamera,
    toggleSpeaker,
    handleSignal,
  };
}
