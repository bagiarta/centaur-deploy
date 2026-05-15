import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';

let socketInstance: Socket | null = null;

export function useSocket() {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!user?.id) return;

    // Reuse singleton socket per session
    if (!socketInstance) {
      socketInstance = io(window.location.origin, {
        query: { userId: user.id },
        transports: ['websocket']
      });
    }

    socketRef.current = socketInstance;

    socketInstance.on('connect', () => setConnected(true));
    socketInstance.on('disconnect', () => setConnected(false));
    if (socketInstance.connected) setConnected(true);

    return () => {
      // Don't disconnect on unmount — keep connection alive globally
    };
  }, [user?.id]);

  const emit = useCallback((event: string, data: unknown) => {
    socketRef.current?.emit(event, data);
  }, []);

  const on = useCallback((event: string, cb: (...args: unknown[]) => void) => {
    socketRef.current?.on(event, cb);
    return () => socketRef.current?.off(event, cb);
  }, []);

  return { socket: socketRef.current, connected, emit, on };
}
