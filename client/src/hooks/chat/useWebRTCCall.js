import { useCallback, useEffect, useRef, useState } from "react";
import { fetchIceServers, fetchIncomingCall, sendCallSignal } from "../../api/chatApi.js";
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
export const CALL_END_NOTICE_MS = 1750;
export const CALL_EXIT_MS = 250;

/**
 * Capture the local media stream for a call. A video request fails on
 * camera-less devices (NotFoundError) or when the camera is otherwise
 * unusable; fall back to an audio-only call.
 */
export async function acquireLocalMedia(wantsVideo) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: wantsVideo,
    });
    return { stream, hasVideo: wantsVideo };
  } catch (err) {
    if (!wantsVideo) throw err;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return { stream, hasVideo: false };
  }
}

/**
 * Call states: idle | calling | ringing | connected
 */
export function useWebRTCCall({ realtimeSenderRef } = {}) {
  const [callState, setCallState] = useState("idle");
  // Set while the call is winding down so the screen can show why it ended
  // (declined | ended | failed) before dropping out.
  const [callEndReason, setCallEndReason] = useState(null);
  const [isCallClosing, setIsCallClosing] = useState(false);
  const [callType, setCallType] = useState("voice"); // voice | video
  const [callChatId, setCallChatId] = useState(null);
  const [callPeer, setCallPeer] = useState(null); // { username, nickname, avatar }
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  // True when the local device has no usable camera.
  const [isCameraUnavailable, setIsCameraUnavailable] = useState(false);
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
  const endNoticeTimerRef = useRef(null);
  const endExitTimerRef = useRef(null);
  const callEndReasonRef = useRef(null);
  const iceServersRef = useRef([]);
  const pendingCandidatesRef = useRef([]);

  // Mirrors of state used inside stable callbacks so they never read stale values
  const callStateRef = useRef(callState);
  const callTypeRef = useRef(callType);
  const callChatIdRef = useRef(callChatId);
  const cameraUnavailableRef = useRef(false);

  useEffect(() => {
    cameraUnavailableRef.current = isCameraUnavailable;
  }, [isCameraUnavailable]);

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

  const clearEndTimers = useCallback(() => {
    if (endNoticeTimerRef.current) {
      clearTimeout(endNoticeTimerRef.current);
      endNoticeTimerRef.current = null;
    }
    if (endExitTimerRef.current) {
      clearTimeout(endExitTimerRef.current);
      endExitTimerRef.current = null;
    }
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
    clearEndTimers();
    callEndReasonRef.current = null;
    setCallEndReason(null);

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
    cameraUnavailableRef.current = false;
    setCallQuality(UNKNOWN_QUALITY);
    setCallState("idle");
    callStateRef.current = "idle";
    setCallChatId(null);
    callChatIdRef.current = null;
    setCallPeer(null);
    setCallDuration(0);
    setIsMuted(false);
    setIsCameraOff(false);
    setIsCameraUnavailable(false);
    setIsRemoteCameraOff(true);
    setIsSpeakerOn(true);
    setIsCallClosing(false);
  }, [clearEndTimers]);

  // Fade the call screen out, then clear all call state.
  const beginCallExit = useCallback(() => {
    if (endExitTimerRef.current) return;
    if (endNoticeTimerRef.current) {
      clearTimeout(endNoticeTimerRef.current);
      endNoticeTimerRef.current = null;
    }
    setIsCallClosing(true);
    endExitTimerRef.current = setTimeout(resetCallState, CALL_EXIT_MS);
  }, [resetCallState]);

  // Show why the call ended for a few seconds before the screen goes away.
  const finishCall = useCallback(
    (reason) => {
      if (
        callStateRef.current === "idle" ||
        callEndReasonRef.current ||
        endExitTimerRef.current
      )
        return;
      callEndReasonRef.current = reason;
      setCallEndReason(reason);
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
      if (disconnectTimerRef.current) {
        clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      }
      // Stop capturing immediately; the notice is purely visual.
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
      if (remoteAudioRef.current) remoteAudioRef.current.muted = true;
      if (remoteVideoRef.current) remoteVideoRef.current.muted = true;
      if (peerConnectionRef.current) {
        try {
          peerConnectionRef.current.close();
        } catch (_) {}
        peerConnectionRef.current = null;
      }
      endNoticeTimerRef.current = setTimeout(beginCallExit, CALL_END_NOTICE_MS);
    },
    [beginCallExit],
  );

  // Media path broke locally: tell the peer/server the call is over too.
  const failCall = useCallback(() => {
    const chatId = callChatIdRef.current;
    finishCall("failed");
    if (chatId) void postSignal("end", { chatId });
  }, [finishCall, postSignal]);

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });

    pc.onicecandidate = (event) => {
      if (event.candidate && callChatIdRef.current) {
        void postSignal("ice-candidate", {
          chatId: callChatIdRef.current,
          candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate,
        });
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
            failCall();
          }, 5000);
        }
      }
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        failCall();
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  }, [postSignal, failCall]);

  // Start a call (caller)
  const startCall = useCallback(
    async ({
      chatId,
      calleeUsername,
      calleeNickname,
      calleeAvatar,
      calleeColor,
      calleeVerified,
      calleeRole,
      type = "voice",
    }) => {
      const normalizedChatId = String(chatId || "").trim();
      if (!normalizedChatId || !calleeUsername) return;
      if (!isCallSupported()) {
        console.warn("Calls are only supported over secure HTTPS connections");
        return;
      }

      clearEndTimers();
      callEndReasonRef.current = null;
      setCallEndReason(null);
      setIsCallClosing(false);
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
        color: calleeColor,
        verified: calleeVerified,
        role: calleeRole,
      });

      try {
        const { stream: gotStream, hasVideo } = await acquireLocalMedia(
          type === "video",
        );
        localStreamRef.current = gotStream;
        // A video call started on a device without a usable camera joins
        // audio-only with the camera off.
        setIsCameraOff(!hasVideo);
        setIsCameraUnavailable(type === "video" && !hasVideo);
        if (localVideoRef.current && hasVideo) {
          localVideoRef.current.srcObject = gotStream;
        }

        const res = await postSignal("start", {
          chatId: normalizedChatId,
          type,
        });
        if (!res?.ok && !res?.call) {
          finishCall("failed");
        } else if (type === "video" && !hasVideo) {
          // A camera-less video caller joins audio-only.
          void postSignal("camera-state", {
            chatId: normalizedChatId,
            cameraOff: true,
          });
        }
      } catch (err) {
        console.error("Failed to start call:", err);
        finishCall("failed");
      }
    },
    [postSignal, finishCall, clearEndTimers]
  );

  // Associate media streams with the media elements once they mount or when a
  // new remote stream arrives.
  useEffect(() => {
    if (callState !== "connected") return;
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
    if (remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
    }
    if (remoteAudioRef.current && remoteStreamRef.current) {
      remoteAudioRef.current.srcObject = remoteStreamRef.current;
      remoteAudioRef.current.play?.().catch(() => {});
    }
  }, [callState, callType, remoteStreamTick]);

  // Speaker toggle flips mute on the remote media elements.
  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.muted = !isSpeakerOn;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = !isSpeakerOn;
    }
  }, [isSpeakerOn, callState, callType, remoteStreamTick]);

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
      const { stream, hasVideo } = await acquireLocalMedia(
        acceptedType === "video",
      );
      localStreamRef.current = stream;
      // Voice calls start with camera off; a video call without a usable
      // camera joins audio-only with the camera off.
      setIsCameraOff(!hasVideo);
      setIsCameraUnavailable(acceptedType === "video" && !hasVideo);

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
        finishCall("failed");
        return;
      }
      if (acceptedType === "video" && !hasVideo) {
        // A video call accepted without a usable camera joins audio-only;
        // tell the caller so its screen drops the empty video stage.
        void postSignal("camera-state", { chatId, cameraOff: true });
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
      finishCall("failed");
      await postSignal("reject", { chatId });
    }
  }, [createPeerConnection, postSignal, finishCall]);

  // Reject incoming call (callee)
  const rejectCall = useCallback(async () => {
    const chatId = callChatIdRef.current;
    beginCallExit();
    if (chatId) await postSignal("reject", { chatId });
  }, [postSignal, beginCallExit]);

  // End active call
  const endCall = useCallback(async () => {
    const chatId = callChatIdRef.current;
    beginCallExit();
    if (chatId) await postSignal("end", { chatId });
  }, [postSignal, beginCallExit]);

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
      if (cameraUnavailableRef.current) return;
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
            void postSignal("reject", {
              chatId: payload.chatId,
              reason: "unsupported",
            });
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
            color: payload.caller?.color || payload.callerColor,
            verified: payload.caller?.verified ?? payload.callerVerified,
            role: payload.caller?.role || payload.callerRole,
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
            
            if (!localStreamRef.current?.getVideoTracks().length) {
              pc.addTransceiver("video", { direction: "recvonly" });
            }
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await postSignal("offer", {
              chatId: callChatIdRef.current,
              sdp: offer,
            });
          } catch (err) {
            console.error("Failed to create offer:", err);
            finishCall("failed");
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
            finishCall("failed");
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
          const pc = peerConnectionRef.current;
          if (pc && pc.remoteDescription && pc.signalingState !== "closed") {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            } catch {
              // candidate may be stale (e.g. after renegotiation); safe to drop
            }
          } else {
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

        case "call:rejected": {
          if (
            callChatIdRef.current &&
            String(payload.chatId) !== String(callChatIdRef.current)
          ) {
            return;
          }
          // "unsupported" means the peer could not take the call at all
          // (e.g. insecure HTTP instance), not a deliberate decline.
          finishCall(
            payload.reason === "unsupported" ? "failed" : "declined"
          );
          break;
        }

        case "call:ended": {
          if (
            callChatIdRef.current &&
            String(payload.chatId) !== String(callChatIdRef.current)
          ) {
            return;
          }
          finishCall("ended");
          break;
        }

        case "call:error": {
          if (
            callChatIdRef.current &&
            String(payload.chatId) === String(callChatIdRef.current)
          ) {
            finishCall("failed");
          }
          break;
        }

        default:
          break;
      }
    },
    [createPeerConnection, postSignal, finishCall]
  );

  // Recover a call that started while this app was closed.
  useEffect(() => {
    let isCancelled = false;
    void fetchIncomingCall().then((payload) => {
      if (!isCancelled && payload?.call) {
        void handleSignal(payload.call);
      }
    });
    return () => {
      isCancelled = true;
    };
  }, [handleSignal]);

  // Auto cleanup on unmount
  useEffect(() => {
    return () => {
      resetCallState();
    };
  }, [resetCallState]);

  return {
    callState,
    callEndReason,
    isCallClosing,
    callType,
    callChatId,
    callPeer,
    callDuration,
    callQuality,
    isMuted,
    isCameraOff,
    isCameraUnavailable,
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
