import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Call states: idle | calling | ringing | connected | ended
 */
export function useWebRTCCall({ getSocket, username }) {
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

  // Cleanup
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

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection({
      iceServers: iceServersRef.current,
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const socket = getSocket();
        socket?.emit("call:ice-candidate", {
          chatId: callChatId,
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
        durationTimerRef.current = setInterval(() => {
          setCallDuration((prev) => prev + 1);
        }, 1000);
      }
      if (
        pc.connectionState === "disconnected" ||
        pc.connectionState === "failed"
      ) {
        endCall();
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  }, [getSocket, callChatId]);

  // Start a call (caller)
  const startCall = useCallback(
    async ({ chatId, calleeUsername, type = "voice" }) => {
      const socket = getSocket();
      if (!socket) return;

      setCallState("calling");
      setCallType(type);
      setCallChatId(chatId);
      setCallPeer({ username: calleeUsername });

      socket.emit("call:start", { chatId, calleeUsername, type });
    },
    [getSocket],
  );

  // Accept incoming call (callee)
  const acceptCall = useCallback(async () => {
    const socket = getSocket();
    if (!socket || !callChatId) return;

    setCallState("connected");
    socket.emit("call:accept", { chatId: callChatId });

    const pc = createPeerConnection();
    const constraints = {
      audio: true,
      video: callType === "video",
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // Process any pending candidates
      for (const candidate of pendingCandidatesRef.current) {
        await pc.addIceCandidate(candidate);
      }
      pendingCandidatesRef.current = [];
    } catch (err) {
      console.error("Failed to get media:", err);
      endCall();
    }
  }, [getSocket, callChatId, callType, createPeerConnection]);

  // Reject incoming call
  const rejectCall = useCallback(() => {
    const socket = getSocket();
    if (!socket || !callChatId) return;

    socket.emit("call:reject", { chatId: callChatId });
    setCallState("idle");
    setCallChatId(null);
    setCallPeer(null);
    cleanup();
  }, [getSocket, callChatId, cleanup]);

  // End active call
  const endCall = useCallback(() => {
    const socket = getSocket();
    if (socket && callChatId) {
      socket.emit("call:end", { chatId: callChatId });
    }
    setCallState("idle");
    setCallChatId(null);
    setCallPeer(null);
    cleanup();
  }, [getSocket, callChatId, cleanup]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const audioTracks = localStreamRef.current.getAudioTracks();
    audioTracks.forEach((track) => {
      track.enabled = !track.enabled;
    });
    setIsMuted((prev) => !prev);
  }, []);

  // Toggle camera
  const toggleCamera = useCallback(() => {
    if (!localStreamRef.current) return;
    const videoTracks = localStreamRef.current.getVideoTracks();
    videoTracks.forEach((track) => {
      track.enabled = !track.enabled;
    });
    setIsCameraOff((prev) => !prev);
  }, []);

  // Socket event listeners
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleIncoming = (data) => {
      setCallState("ringing");
      setCallType(data.type || "voice");
      setCallChatId(data.chatId);
      setCallPeer({
        username: data.callerUsername,
        nickname: data.callerNickname,
        avatar: data.callerAvatar,
      });
      iceServersRef.current = data.iceServers || [];
    };

    const handleStarted = (data) => {
      iceServersRef.current = data.iceServers || [];
    };

    const handleAccepted = async () => {
      // Caller creates offer after callee accepts
      const pc = createPeerConnection();
      const constraints = {
        audio: true,
        video: callType === "video",
      };

      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("call:offer", { chatId: callChatId, offer });
      } catch (err) {
        console.error("Failed to create offer:", err);
        endCall();
      }
    };

    const handleRejected = () => {
      setCallState("idle");
      setCallChatId(null);
      setCallPeer(null);
      cleanup();
    };

    const handleEnded = () => {
      setCallState("idle");
      setCallChatId(null);
      setCallPeer(null);
      cleanup();
    };

    const handleOffer = async (data) => {
      const pc = peerConnectionRef.current;
      if (!pc) return;

      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("call:answer", { chatId: data.chatId, answer });
    };

    const handleAnswer = async (data) => {
      const pc = peerConnectionRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    };

    const handleIceCandidate = async (data) => {
      const pc = peerConnectionRef.current;
      if (!pc || !pc.remoteDescription) {
        pendingCandidatesRef.current.push(new RTCIceCandidate(data.candidate));
        return;
      }
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    };

    socket.on("call:incoming", handleIncoming);
    socket.on("call:started", handleStarted);
    socket.on("call:accepted", handleAccepted);
    socket.on("call:rejected", handleRejected);
    socket.on("call:ended", handleEnded);
    socket.on("call:offer", handleOffer);
    socket.on("call:answer", handleAnswer);
    socket.on("call:ice-candidate", handleIceCandidate);

    return () => {
      socket.off("call:incoming", handleIncoming);
      socket.off("call:started", handleStarted);
      socket.off("call:accepted", handleAccepted);
      socket.off("call:rejected", handleRejected);
      socket.off("call:ended", handleEnded);
      socket.off("call:offer", handleOffer);
      socket.off("call:answer", handleAnswer);
      socket.off("call:ice-candidate", handleIceCandidate);
    };
  }, [getSocket, callType, callChatId, createPeerConnection, endCall, cleanup]);

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
  };
}
