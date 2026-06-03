import { useState, useEffect, useRef, useCallback } from "react";

export function useWebSocket(
  url: string,
  onMessage: (event: any) => void,
  sessionId: string
) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const onMsgRef = useRef(onMessage);
  const sidRef = useRef(sessionId);
  onMsgRef.current = onMessage;
  sidRef.current = sessionId;

  useEffect(() => {
    let stopped = false;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      if (stopped) return;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (stopped) return;
        setConnected(true);
        // 发送握手，携带上次的 sessionId
        ws.send(
          JSON.stringify({
            type: "handshake",
            sessionId: sidRef.current || undefined,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          onMsgRef.current(JSON.parse(event.data));
        } catch {}
      };

      ws.onclose = () => {
        if (!stopped) {
          setConnected(false);
          reconnectTimer = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      stopped = true;
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [url]);

  const send = useCallback((data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { send, connected };
}
