import { useCallback, useEffect, useRef, useState } from "react";
import { fetchIceServers, fetchIncomingCall, sendCallSignal } from "../../api/chatApi.js";
import {
  isCallSupported,
  isScreenShareSupported,
  foldIncomingRemoteStream,
} from "../../utils/callCapabilities.js";

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
 * Put an outgoing video track on the peer connection. An existing video
 * sender (the camera, or a sender left over from an earlier share) is reused
 * with replaceTrack so no renegotiation is needed. Otherwise the video
 * transceiver negotiated at call setup is switched to sending, or a new
 * track is added. Returns { sender, needsNegotiation }.
 */
export async function attachOutgoingVideoTrack(pc, track, stream) {
  const senders = typeof pc.getSenders === "function" ? pc.getSenders() : [];
  const activeSender = senders.find((s) => s.track?.kind === "video");
  if (activeSender) {
    await activeSender.replaceTrack(track);
    return { sender: activeSender, needsNegotiation: false };
  }

  const transceivers =
    typeof pc.getTransceivers === "function" ? pc.getTransceivers() : [];
  const videoTransceiver = transceivers.find(
    (t) =>
      !t.stopped &&
      t.currentDirection !== "stopped" &&
      t.receiver?.track?.kind === "video",
  );
  if (videoTransceiver) {
    await videoTransceiver.sender.replaceTrack(track);
    if (stream && typeof videoTransceiver.sender.setStreams === "function") {
      videoTransceiver.sender.setStreams(stream);
    }
    const direction = videoTransceiver.direction;
    if (direction === "sendrecv" || direction === "sendonly") {
      return { sender: videoTransceiver.sender, needsNegotiation: false };
    }
    videoTransceiver.direction =
      direction === "inactive" ? "sendonly" : "sendrecv";
    return { sender: videoTransceiver.sender, needsNegotiation: true };
  }

  const sender = stream ? pc.addTrack(track, stream) : pc.addTrack(track);
  return { sender, needsNegotiation: true };
}

/**
 * Swap the outgoing camera to a newly acquired track: replace the track in
 * the local preview stream, retarget the video sender (no renegotiation when
 * one exists), and stop the old track.
 */
export async function swapCameraTrack({ pc, stream, newTrack, videoEl }) {
  const oldTrack = stream.getVideoTracks()[0];
  if (!oldTrack) return null;
  stream.removeTrack(oldTrack);
  stream.addTrack(newTrack);
  if (videoEl) videoEl.srcObject = stream;
  try {
    const result = await attachOutgoingVideoTrack(pc, newTrack, stream);
    oldTrack.stop();
    return result;
  } catch (err) {
    // Put the old camera back: the stream must match what the sender still
    // carries, or the local preview and the peer's picture disagree.
    try {
      stream.removeTrack(newTrack);
    } catch (_) {}
    try {
      stream.addTrack(oldTrack);
    } catch (_) {}
    if (videoEl) videoEl.srcObject = stream;
    try {
      newTrack.stop();
    } catch (_) {}
    throw err;
  }
}

/**
 * True when a local send was left out of the last negotiation, which happens
 * when an offer collision rolled back the offer that carried it.
 */
export function hasUnnegotiatedSend(pc) {
  const transceivers =
    typeof pc.getTransceivers === "function" ? pc.getTransceivers() : [];
  return transceivers.some((t) => {
    if (t.stopped || t.currentDirection === "stopped") return false;
    if (!t.direction?.includes("send")) return false;
    return !t.mid || !t.currentDirection?.includes("send");
  });
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
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isRemoteScreenSharing, setIsRemoteScreenSharing] = useState(false);
  const [isScreenAudioMuted, setIsScreenAudioMuted] = useState(false);
  // True when the local device exposes more than one camera (front/back flip).
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const screenAudioRef = useRef(null);
  const screenAudioStreamRef = useRef(null);
  const durationTimerRef = useRef(null);
  const disconnectTimerRef = useRef(null);
  const endNoticeTimerRef = useRef(null);
  const endExitTimerRef = useRef(null);
  const callEndReasonRef = useRef(null);
  const iceServersRef = useRef([]);
  const pendingCandidatesRef = useRef([]);
  // Active screen capture track, and the RTP sender carrying outgoing video
  // (camera or screen) so the two can be swapped without renegotiating.
  const screenTrackRef = useRef(null);
  const screenAudioSenderRef = useRef(null);
  const videoSenderRef = useRef(null);
  // Current capture facing ("user" | "environment") and in-flight flip guard,
  // plus a ref mirror of the multi-camera check used inside stable callbacks.
  const facingModeRef = useRef("user");
  const isFlippingRef = useRef(false);
  const hasMultipleCamerasRef = useRef(false);
  // Offer collisions: both peers may renegotiate at once. The callee is the
  // polite peer and yields; the caller ignores the colliding offer.
  const isPolitePeerRef = useRef(false);
  const isMakingOfferRef = useRef(false);
  const isSettingRemoteAnswerRef = useRef(false);

  // Mirrors of state used inside stable callbacks so they never read stale values
  const callStateRef = useRef(callState);
  const callTypeRef = useRef(callType);
  const callChatIdRef = useRef(callChatId);
  const cameraUnavailableRef = useRef(false);

  useEffect(() => {
    cameraUnavailableRef.current = isCameraUnavailable;
  }, [isCameraUnavailable]);

  useEffect(() => {
    hasMultipleCamerasRef.current = hasMultipleCameras;
  }, [hasMultipleCameras]);

  // Count cameras once permission exists (a connected call has granted it);
  // labels are only reliable after getUserMedia.
  useEffect(() => {
    if (callState !== "connected") return undefined;
    let isCancelled = false;
    navigator.mediaDevices
      ?.enumerateDevices?.()
      .then((devices) => {
        if (!isCancelled) {
          setHasMultipleCameras(
            devices.filter((d) => d.kind === "videoinput").length > 1,
          );
        }
      })
      .catch(() => {});
    return () => {
      isCancelled = true;
    };
  }, [callState]);

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

  // Call flows must never build a peer connection without ICE servers.
  const ensureIceServers = useCallback(async () => {
    if (iceServersRef.current.length) return iceServersRef.current;
    const servers = await fetchIceServers();
    if (Array.isArray(servers) && servers.length) {
      iceServersRef.current = servers;
    }
    return iceServersRef.current;
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

  const releaseScreenShare = useCallback(() => {
    const track = screenTrackRef.current;
    screenTrackRef.current = null;
    if (track) {
      track.onended = null;
      try {
        track.stop();
      } catch (_) {}
    }
    videoSenderRef.current = null;
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
    screenAudioStreamRef.current = null;
    if (screenAudioRef.current) {
      screenAudioRef.current.srcObject = null;
      screenAudioRef.current.muted = false;
    }

    if (peerConnectionRef.current) {
      try {
        peerConnectionRef.current.close();
      } catch (_) {}
      peerConnectionRef.current = null;
    }

    pendingCandidatesRef.current = [];
    isPolitePeerRef.current = false;
    isMakingOfferRef.current = false;
    isSettingRemoteAnswerRef.current = false;
    releaseScreenShare();
    setIsScreenSharing(false);
    setIsRemoteScreenSharing(false);
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
    setIsScreenAudioMuted(false);
    setHasMultipleCameras(false);
    facingModeRef.current = "user";
    setIsCallClosing(false);
  }, [clearEndTimers, releaseScreenShare]);

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
      releaseScreenShare();
      setIsScreenSharing(false);
      setIsRemoteScreenSharing(false);
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
    [beginCallExit, releaseScreenShare],
  );

  // Media path broke locally: tell the peer/server the call is over too.
  const failCall = useCallback(() => {
    const chatId = callChatIdRef.current;
    finishCall("failed");
    if (chatId) void postSignal("end", { chatId });
  }, [finishCall, postSignal]);

  const createPeerConnection = useCallback(async () => {
    const pc = new RTCPeerConnection({ iceServers: await ensureIceServers() });

    pc.onicecandidate = (event) => {
      if (event.candidate && callChatIdRef.current) {
        void postSignal("ice-candidate", {
          chatId: callChatIdRef.current,
          candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      // Screen-share audio arrives on its own display stream; route it to a
      // dedicated element so it can be muted independently from the mic.
      const ownStream = event.streams?.[0];
      if (
        event.track?.kind === "audio" &&
        ownStream &&
        remoteStreamRef.current &&
        ownStream !== remoteStreamRef.current
      ) {
        screenAudioStreamRef.current = ownStream;
        if (screenAudioRef.current) {
          screenAudioRef.current.srcObject = ownStream;
          screenAudioRef.current.play?.().catch(() => {});
        }
        setRemoteStreamTick((t) => t + 1);
        return;
      }
      // A video sender reused for screen sharing may arrive without a stream
      // association; fold its track into the current remote stream.
      const stream = foldIncomingRemoteStream(event, remoteStreamRef.current);
      remoteStreamRef.current = stream;
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = stream;
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
  }, [postSignal, failCall, ensureIceServers]);

  const sendOffer = useCallback(
    async (pc) => {
      isMakingOfferRef.current = true;
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        // A colliding remote offer may have rolled this one back already.
        if (pc.signalingState !== "have-local-offer") return;
        await postSignal("offer", { chatId: callChatIdRef.current, sdp: offer });
      } finally {
        isMakingOfferRef.current = false;
      }
    },
    [postSignal],
  );

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
      if (callStateRef.current !== "idle") return;
      if (!isCallSupported()) {
        console.warn("Calls are only supported over secure HTTPS connections");
        return;
      }

      clearEndTimers();
      callEndReasonRef.current = null;
      setCallEndReason(null);
      setIsCallClosing(false);
      isPolitePeerRef.current = false;
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
    if (screenAudioRef.current && screenAudioStreamRef.current) {
      screenAudioRef.current.srcObject = screenAudioStreamRef.current;
      screenAudioRef.current.play?.().catch(() => {});
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
    if (screenAudioRef.current) {
      screenAudioRef.current.muted = !isSpeakerOn || isScreenAudioMuted;
    }
  }, [isSpeakerOn, isScreenAudioMuted, callState, callType, remoteStreamTick]);

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

      const pc = await createPeerConnection();
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

  // Mute only the shared-screen audio, not the peer's voice.
  const toggleScreenAudio = useCallback(() => {
    setIsScreenAudioMuted((prev) => !prev);
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
        if (screenTrackRef.current) {
          // The screen is on the video sender; the camera takes over when
          // sharing stops.
        } else if (videoSenderRef.current && pc && pc.signalingState !== "closed") {
          // Reuse the sender an earlier screen share already negotiated.
          await videoSenderRef.current.replaceTrack(videoTrack);
        } else if (pc && pc.signalingState !== "closed") {
          pc.addTrack(videoTrack, stream);
          await sendOffer(pc);
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
  }, [postSignal, sendOffer]);

  // Swap between front and back cameras mid-call: acquire the other camera's
  // track and hand it to the existing video sender (no renegotiation).
  const flipCamera = useCallback(async () => {
    if (isFlippingRef.current || !hasMultipleCamerasRef.current) return;
    // The video sender carries the screen while sharing; do not swap it.
    if (screenTrackRef.current) return;
    const stream = localStreamRef.current;
    const pc = peerConnectionRef.current;
    if (!stream || !pc || pc.signalingState === "closed") return;
    const [oldTrack] = stream.getVideoTracks();
    if (!oldTrack || !oldTrack.enabled) return;

    const next = facingModeRef.current === "environment" ? "user" : "environment";
    isFlippingRef.current = true;
    try {
      let newTrack;
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: next },
        });
        [newTrack] = videoStream.getVideoTracks();
        if (!newTrack) return;
        // The call may have ended while the camera was acquired.
        if (
          localStreamRef.current !== stream ||
          peerConnectionRef.current !== pc
        ) {
          newTrack.stop();
          return;
        }
        // State changed during acquisition: a screen share owns the video
        // sender now, or the user turned the camera off mid-flip. Backing out
        // keeps the peer's picture in sync with the local UI.
        if (screenTrackRef.current || !stream.getVideoTracks()[0]?.enabled) {
          newTrack.stop();
          return;
        }
      } catch (err) {
        console.warn("Failed to switch camera:", err);
        return;
      }
      try {
        const { sender, needsNegotiation } = await swapCameraTrack({
          pc,
          stream,
          newTrack,
          videoEl: localVideoRef.current,
        });
        if (sender) videoSenderRef.current = sender;
        facingModeRef.current = next;
        if (needsNegotiation && peerConnectionRef.current === pc) {
          await sendOffer(pc);
        }
      } catch (err) {
        // Swap failed: keep running on the old camera (it was not stopped,
        // and remains in the stream unless the throw came after the swap).
        console.warn("Failed to switch camera:", err);
      }
    } finally {
      isFlippingRef.current = false;
    }
  }, [sendOffer]);

  const stopScreenShare = useCallback(async () => {
    const track = screenTrackRef.current;
    if (!track) return;
    const audioTrack = screenAudioSenderRef.current?.track;
    const sender = videoSenderRef.current;
    screenTrackRef.current = null;
    track.onended = null;
    try {
      track.stop();
    } catch (_) {}
    try {
      audioTrack?.stop();
    } catch (_) {}
    setIsScreenSharing(false);
    const pc = peerConnectionRef.current;
    if (sender && pc && pc.signalingState !== "closed") {
      // Hand the video sender back to the camera (or send nothing).
      const cameraTrack = localStreamRef.current?.getVideoTracks()[0] || null;
      try {
        await sender.replaceTrack(cameraTrack);
      } catch (err) {
        console.error("Failed to restore camera after screen share:", err);
      }
    }
    if (callChatIdRef.current) {
      void postSignal("screen-share-state", {
        chatId: callChatIdRef.current,
        sharing: false,
      });
    }
  }, [postSignal]);

  const startScreenShare = useCallback(async () => {
    if (screenTrackRef.current) return;
    if (callStateRef.current !== "connected") return;
    if (!isScreenShareSupported()) return;
    const pc = peerConnectionRef.current;
    if (!pc || pc.signalingState === "closed") return;

    let displayStream;
    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
    } catch (err) {
      // NotAllowedError: the user closed the picker; nothing to report.
      if (err?.name !== "NotAllowedError") {
        console.error("Failed to start screen share:", err);
      }
      return;
    }
    const [screenTrack] = displayStream.getVideoTracks();
    if (!screenTrack) return;
    // The call may have ended while the picker was open.
    if (
      peerConnectionRef.current !== pc ||
      pc.signalingState === "closed" ||
      screenTrackRef.current
    ) {
      displayStream.getTracks().forEach((t) => t.stop());
      return;
    }
    if ("contentHint" in screenTrack) screenTrack.contentHint = "detail";
    screenTrackRef.current = screenTrack;

    try {
      const { sender, needsNegotiation } = await attachOutgoingVideoTrack(
        pc,
        screenTrack,
        localStreamRef.current,
      );
      videoSenderRef.current = sender;
      let audioNeedsNegotiation = false;
      const [screenAudio] = displayStream.getAudioTracks();
      if (screenAudio) {
        try {
          if (screenAudioSenderRef.current) {
            // A silent audio m-line was left by an earlier share.
            await screenAudioSenderRef.current.replaceTrack(screenAudio);
          } else {
            // Screen audio is a second audio track; it needs a new m-line.
            screenAudioSenderRef.current = pc.addTrack(
              screenAudio,
              displayStream,
            );
            audioNeedsNegotiation = true;
          }
        } catch (err) {
          console.error("Failed to send screen audio:", err);
          screenAudioSenderRef.current = null;
        }
      }
      if (needsNegotiation || audioNeedsNegotiation) await sendOffer(pc);
    } catch (err) {
      console.error("Failed to send screen share:", err);
      screenTrackRef.current = null;
      try {
        screenTrack.stop();
      } catch (_) {}
      return;
    }

    // The browser's own "Stop sharing" control ends the track.
    screenTrack.onended = () => {
      void stopScreenShare();
    };
    setIsScreenSharing(true);
    void postSignal("screen-share-state", {
      chatId: callChatIdRef.current,
      sharing: true,
    });
  }, [postSignal, sendOffer, stopScreenShare]);

  const toggleScreenShare = useCallback(() => {
    if (screenTrackRef.current) return stopScreenShare();
    return startScreenShare();
  }, [startScreenShare, stopScreenShare]);

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
          isPolitePeerRef.current = true;
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
            const pc = await createPeerConnection();
            if (localStreamRef.current) {
              localStreamRef.current
                .getTracks()
                .forEach((track) => pc.addTrack(track, localStreamRef.current));
            }
            
            if (!localStreamRef.current?.getVideoTracks().length) {
              pc.addTransceiver("video", { direction: "recvonly" });
            }
            await sendOffer(pc);
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
              pc = await createPeerConnection();
              if (localStreamRef.current) {
                localStreamRef.current
                  .getTracks()
                  .forEach((track) =>
                    pc.addTrack(track, localStreamRef.current)
                  );
              }
            }
            const isReadyForOffer =
              !isMakingOfferRef.current &&
              (pc.signalingState === "stable" ||
                isSettingRemoteAnswerRef.current);
            if (!isReadyForOffer && !isPolitePeerRef.current) break;
            // For the polite peer this implicitly rolls back its own offer.
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
            // Whatever the rolled-back offer carried still has to go out.
            if (!isReadyForOffer && hasUnnegotiatedSend(pc)) {
              await sendOffer(pc);
            }
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
              isSettingRemoteAnswerRef.current = true;
              try {
                await pc.setRemoteDescription(new RTCSessionDescription(sdpAnswer));
              } finally {
                isSettingRemoteAnswerRef.current = false;
              }
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

        case "call:screen-share-state": {
          if (
            callChatIdRef.current &&
            String(payload.chatId) !== String(callChatIdRef.current)
          ) {
            return;
          }
          setIsRemoteScreenSharing(payload.sharing === true);
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
    [createPeerConnection, postSignal, finishCall, sendOffer]
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
    isScreenSharing,
    isRemoteScreenSharing,
    isScreenAudioMuted,
    localVideoRef,
    remoteVideoRef,
    remoteAudioRef,
    screenAudioRef,
    screenAudioStreamRef,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleCamera,
    toggleSpeaker,
    toggleScreenAudio,
    startScreenShare,
    stopScreenShare,
    toggleScreenShare,
    flipCamera,
    canFlipCamera:
      hasMultipleCameras &&
      callState === "connected" &&
      !isCameraOff &&
      !isCameraUnavailable &&
      !isScreenSharing,
    handleSignal,
  };
}
