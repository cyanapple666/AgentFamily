import { useState, useEffect, useRef, useCallback } from "react";

/**
 * WebSocket 连接 Hook
 * 
 * 管理 WebSocket 连接，自动重连，并在发送消息时携带 sessionId
 * 
 * @param url WebSocket 服务器地址
 * @param onMessage 消息回调函数
 * @param sessionId 当前会话 ID
 * @returns { send, connected } 发送函数和连接状态
 */
export function useWebSocket(
  url: string,
  onMessage: (event: any) => void,
  sessionId: string
) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const onMsgRef = useRef(onMessage);
  const sidRef = useRef(sessionId);

  // 实时更新引用
  onMsgRef.current = onMessage;
  sidRef.current = sessionId;

  useEffect(() => {
    let stopped = false;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    /**
     * 建立 WebSocket 连接
     */
    function connect() {
      if (stopped) return;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (stopped) return;
        setConnected(true);
        // 暴露 WebSocket 实例到 window，供 SettingsPanel 等组件使用
        (window as any).__afWs = ws;
        // 发送握手消息，携带上次的 sessionId 用于会话恢复
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
        } catch (err) {
          console.error("[WebSocket] 消息解析失败:", err);
        }
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

  /**
   * 发送消息到服务器
   * 自动携带 sessionId 以确保会话一致性
   * 
   * @param data 消息数据
   */
  const send = useCallback((data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // 如果消息中已经包含 sessionId，则使用消息中的值（用于切换会话等操作）
      // 否则自动添加当前 sessionId，确保服务器能识别会话
      const messageWithSession = {
        ...data,
        sessionId: data.sessionId !== undefined ? data.sessionId : (sidRef.current || undefined),
      };
      wsRef.current.send(JSON.stringify(messageWithSession));
    }
  }, []);

  return { send, connected };
}
