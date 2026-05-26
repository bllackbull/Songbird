import { useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";

export function useCallSocket({ username }) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!username) return;

    const socket = io(window.location.origin, {
      withCredentials: true,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: 10,
    });

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [username]);

  const getSocket = useCallback(() => socketRef.current, []);

  return { getSocket, connected };
}
