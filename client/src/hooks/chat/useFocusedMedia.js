import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export function useFocusedMedia({ isDesktop, isMobileTouchDevice }) {
  const [focusedMedia, setFocusedMedia] = useState(null);
  const [focusVisible, setFocusVisible] = useState(false);
  const focusedVideoRef = useRef(null);
  const focusUnmountTimerRef = useRef(null);
  const focusEnterRafRef = useRef(null);
  const focusSwipeStartRef = useRef({ x: 0, y: 0, tracking: false });
  const focusedVideoHintTimerRef = useRef(null);
  const [focusedVideoPlaying, setFocusedVideoPlaying] = useState(false);
  const [focusedVideoMuted, setFocusedVideoMuted] = useState(false);
  const [focusedVideoTime, setFocusedVideoTime] = useState(0);
  const [focusedVideoDuration, setFocusedVideoDuration] = useState(0);
  const [focusedVideoHint, setFocusedVideoHint] = useState(null);
  const [focusedMediaLoaded, setFocusedMediaLoaded] = useState(false);
  const [focusedVideoDecodeIssue, setFocusedVideoDecodeIssue] = useState("");
  const [focusNowMs, setFocusNowMs] = useState(Date.now());

  const getFocusAspectRatio = useCallback(() => {
    const width = Number(focusedMedia?.width);
    const height = Number(focusedMedia?.height);
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      return focusedMedia?.type === "video" ? 16 / 9 : 1;
    }
    const ratio = width / height;
    return Math.min(2.4, Math.max(0.42, ratio));
  }, [focusedMedia]);

  const getFocusFrameStyle = useCallback(() => {
    const ratio = getFocusAspectRatio();
    if (isDesktop) {
      return {
        aspectRatio: `${ratio}`,
        width: `min(92vw, ${Math.max(42, Math.round(78 * ratio))}vh)`,
        maxWidth: "92vw",
        maxHeight: "78vh",
      };
    }
    return {
      aspectRatio: `${ratio}`,
      width: `min(92vw, ${Math.max(44, Math.round(62 * ratio))}vh)`,
      maxWidth: "92vw",
      maxHeight: "calc(100vh - 13rem)",
    };
  }, [getFocusAspectRatio, isDesktop]);

  const toggleFocusedVideoPlay = useCallback(() => {
    const video = focusedVideoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play();
      setFocusedVideoHint("play");
    } else {
      video.pause();
      setFocusedVideoHint("pause");
    }
    if (focusedVideoHintTimerRef.current) {
      clearTimeout(focusedVideoHintTimerRef.current);
    }
    focusedVideoHintTimerRef.current = setTimeout(() => {
      setFocusedVideoHint(null);
    }, 420);
  }, []);

  const toggleFocusedVideoMute = useCallback(() => {
    const video = focusedVideoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setFocusedVideoMuted(video.muted);
  }, []);

  const seekFocusedVideo = useCallback((nextValue) => {
    const video = focusedVideoRef.current;
    if (!video) return;
    const value = Number(nextValue || 0);
    video.currentTime = value;
    setFocusedVideoTime(value);
  }, []);

  const handleFocusedVideoLoadedData = useCallback(() => {
    const video = focusedVideoRef.current;
    if (!video) return;
    setFocusedVideoDuration(video.duration || 0);
    setFocusedVideoTime(video.currentTime || 0);
    setFocusedMediaLoaded(true);
    if (
      Number(video.videoWidth || 0) <= 0 &&
      Number(video.videoHeight || 0) <= 0
    ) {
      setFocusedVideoDecodeIssue(
        "Video track could not be decoded in this browser. Audio may still play.",
      );
    } else {
      setFocusedVideoDecodeIssue("");
    }
    if (!focusVisible) return;
    const playPromise = video.play?.();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        // user gesture may be required on some devices
      });
    }
  }, [focusVisible]);

  const handleFocusedVideoLoadedMetadata = useCallback(() => {
    const video = focusedVideoRef.current;
    if (!video) return;
    setFocusedVideoDuration(video.duration || 0);
    setFocusedVideoTime(video.currentTime || 0);
    setFocusedMediaLoaded(true);
    if (
      Number(video.videoWidth || 0) <= 0 &&
      Number(video.videoHeight || 0) <= 0
    ) {
      setFocusedVideoDecodeIssue(
        "Video track could not be decoded in this browser. Audio may still play.",
      );
    } else {
      setFocusedVideoDecodeIssue("");
    }
  }, []);

  const handleFocusedVideoCanPlay = useCallback(() => {
    const video = focusedVideoRef.current;
    if (!video || !focusVisible) return;
    if (!video.paused) return;
    const playPromise = video.play?.();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        // user gesture may be required on some devices
      });
    }
  }, [focusVisible]);

  const handleFocusedVideoError = useCallback(() => {
    setFocusedVideoDecodeIssue(
      "This video format or codec is not supported by your browser.",
    );
  }, []);

  const formatSeconds = useCallback((seconds) => {
    const safe = Math.max(0, Math.floor(Number(seconds || 0)));
    const mins = Math.floor(safe / 60);
    const secs = safe % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  }, []);

  const openFocusMedia = useCallback((media) => {
    if (focusUnmountTimerRef.current) {
      clearTimeout(focusUnmountTimerRef.current);
      focusUnmountTimerRef.current = null;
    }
    if (focusEnterRafRef.current) {
      cancelAnimationFrame(focusEnterRafRef.current);
      focusEnterRafRef.current = null;
    }
    setFocusedMedia(media);
    setFocusedMediaLoaded(false);
    if (media?.type === "video") {
      setFocusedVideoPlaying(false);
      setFocusedVideoTime(0);
      setFocusedVideoDuration(0);
      setFocusedVideoMuted(false);
      setFocusedVideoHint(null);
    }
    setFocusedVideoDecodeIssue("");
    setFocusVisible(false);
    focusEnterRafRef.current = requestAnimationFrame(() => {
      setFocusVisible(true);
    });
  }, []);

  const closeFocusMedia = useCallback(() => {
    if (!focusedMedia) return;
    setFocusVisible(false);
    if (focusUnmountTimerRef.current) {
      clearTimeout(focusUnmountTimerRef.current);
    }
    focusUnmountTimerRef.current = setTimeout(() => {
      setFocusedMedia(null);
      setFocusedVideoDecodeIssue("");
      focusUnmountTimerRef.current = null;
    }, 230);
  }, [focusedMedia]);

  const handleFocusTouchStart = useCallback(
    (event) => {
      if (isDesktop || !isMobileTouchDevice) return;
      const touch = event.touches?.[0];
      if (!touch) return;
      focusSwipeStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        tracking: true,
      };
    },
    [isDesktop, isMobileTouchDevice],
  );

  const handleFocusTouchEnd = useCallback(
    (event) => {
      if (isDesktop || !isMobileTouchDevice) return;
      const start = focusSwipeStartRef.current;
      if (!start.tracking) return;
      const touch = event.changedTouches?.[0];
      if (!touch) return;
      const dx = Math.abs(touch.clientX - start.x);
      const dy = touch.clientY - start.y;
      if (dy > 120 && dx < 90) {
        closeFocusMedia();
      }
    },
    [isDesktop, isMobileTouchDevice, closeFocusMedia],
  );

  useEffect(() => {
    if (!focusedMedia?.expiresAt) return undefined;
    setFocusNowMs(Date.now());
    const timer = window.setInterval(() => {
      setFocusNowMs(Date.now());
    }, 60 * 1000);
    return () => window.clearInterval(timer);
  }, [focusedMedia?.expiresAt]);

  const getExpiryWarning = useCallback(
    (expiresAt) => {
      if (!expiresAt) return null;
      const expiryMs = new Date(expiresAt).getTime();
      if (!Number.isFinite(expiryMs)) return null;
      const diffMs = expiryMs - focusNowMs;
      if (diffMs <= 0) return null;
      const minuteMs = 60 * 1000;
      const hourMs = 60 * minuteMs;
      const dayMs = 24 * hourMs;

      if (diffMs < hourMs) {
        const minutes = Math.max(1, Math.ceil(diffMs / minuteMs));
        return {
          danger: true,
          label: `${minutes}m`,
          title: `This file will be auto-deleted in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
        };
      }
      if (diffMs < dayMs) {
        const hours = Math.max(1, Math.ceil(diffMs / hourMs));
        return {
          danger: true,
          label: `${hours}h`,
          title: `This file will be auto-deleted in ${hours} hour${hours === 1 ? "" : "s"}.`,
        };
      }
      const dayDisplayBiasMs = 55 * minuteMs;
      const days = Math.max(1, Math.floor((diffMs + dayDisplayBiasMs) / dayMs));
      return {
        danger: days <= 1,
        label: `${days}d`,
        title: `This file will be auto-deleted in ${days} day${days === 1 ? "" : "s"}.`,
      };
    },
    [focusNowMs],
  );

  const focusExpiryWarning = useMemo(
    () => getExpiryWarning(focusedMedia?.expiresAt),
    [getExpiryWarning, focusedMedia?.expiresAt],
  );

  useEffect(() => {
    const video = focusedVideoRef.current;
    if (!video || focusedMedia?.type !== "video") return undefined;
    const handleLoaded = () => setFocusedVideoDuration(video.duration || 0);
    const handlePlay = () => setFocusedVideoPlaying(true);
    const handlePause = () => setFocusedVideoPlaying(false);
    const handleTimeUpdate = () => setFocusedVideoTime(video.currentTime || 0);
    const handleEnded = () => setFocusedVideoPlaying(false);
    const handleDurationChange = () =>
      setFocusedVideoDuration(video.duration || 0);
    video.addEventListener("loadedmetadata", handleLoaded);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("durationchange", handleDurationChange);
    setFocusedVideoMuted(video.muted);
    return () => {
      video.removeEventListener("loadedmetadata", handleLoaded);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("durationchange", handleDurationChange);
    };
  }, [focusedMedia]);

  useEffect(() => {
    if (focusedMedia?.type !== "video" || !focusVisible) return;
    const video = focusedVideoRef.current;
    if (!video) return;
    video.muted = false;
    setFocusedVideoMuted(false);
    const tryPlay = () => {
      const playPromise = video.play?.();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {
          // user gesture may be required on some devices
        });
      }
    };
    const raf = requestAnimationFrame(tryPlay);
    return () => cancelAnimationFrame(raf);
  }, [focusedMedia, focusVisible]);

  useEffect(() => {
    return () => {
      if (focusedVideoHintTimerRef.current) {
        clearTimeout(focusedVideoHintTimerRef.current);
      }
      if (focusUnmountTimerRef.current) {
        clearTimeout(focusUnmountTimerRef.current);
      }
      if (focusEnterRafRef.current) {
        cancelAnimationFrame(focusEnterRafRef.current);
      }
    };
  }, []);

  return {
    focusedMedia,
    setFocusedMedia,
    focusVisible,
    setFocusVisible,
    focusedVideoRef,
    focusedVideoPlaying,
    focusedVideoMuted,
    focusedVideoTime,
    focusedVideoDuration,
    focusedVideoHint,
    focusedMediaLoaded,
    setFocusedMediaLoaded,
    focusedVideoDecodeIssue,
    focusExpiryWarning,
    openFocusMedia,
    closeFocusMedia,
    toggleFocusedVideoPlay,
    toggleFocusedVideoMute,
    seekFocusedVideo,
    handleFocusedVideoLoadedData,
    handleFocusedVideoLoadedMetadata,
    handleFocusedVideoCanPlay,
    handleFocusedVideoError,
    handleFocusTouchStart,
    handleFocusTouchEnd,
    getFocusAspectRatio,
    getFocusFrameStyle,
    formatSeconds,
  };
}
