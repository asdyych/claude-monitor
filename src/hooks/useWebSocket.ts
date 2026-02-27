'use client';

import { useEffect, useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { ClientMessage, ServerMessage, ProcessSummary } from '@/types/ws';

// ---------------------------------------------------------------------------
// Global singleton WebSocket manager
// All TerminalView instances share one WS connection so subscriptions are never
// silently dropped due to per-component connection race conditions.
// ---------------------------------------------------------------------------

type MessageHandler = (msg: ServerMessage) => void;

interface WsManagerState {
  connected: boolean;
  processes: ProcessSummary[];
}

class WsManager {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private handlers = new Set<MessageHandler>();
  private pendingMessages: ClientMessage[] = [];
  private stateListeners = new Set<() => void>();

  private _state: WsManagerState = { connected: false, processes: [] };

  get state(): WsManagerState {
    return this._state;
  }

  private setState(next: Partial<WsManagerState>) {
    this._state = { ...this._state, ...next };
    Array.from(this.stateListeners).forEach((l) => l());
  }

  subscribe(listener: () => void) {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  connect() {
    if (typeof window === 'undefined') return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const url = `ws://${window.location.host}/ws/terminal`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      console.log('🔌 [WsManager] Connected');
      this.reconnectAttempts = 0;
      this.setState({ connected: true });

      // Flush queued messages
      const pending = this.pendingMessages.splice(0);
      for (const msg of pending) {
        ws.send(JSON.stringify(msg));
      }
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as ServerMessage;
        if (msg.type === 'process_list') {
          this.setState({ processes: msg.processes });
        }
        Array.from(this.handlers).forEach((h) => h(msg));
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      this.setState({ connected: false });
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 16000);
      this.reconnectAttempts++;
      console.log(`🔌 [WsManager] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  send(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      // Queue subscribe/unsubscribe/resize; input is fire-and-forget
      if (msg.type !== 'input') {
        this.pendingMessages.push(msg);
      }
    }
  }

  addHandler(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}

// Module-level singleton, survives HMR via globalThis
const _g = globalThis as typeof globalThis & { __wsManager?: WsManager };
if (!_g.__wsManager) {
  _g.__wsManager = new WsManager();
}
const manager = _g.__wsManager;

// ---------------------------------------------------------------------------
// React hook: thin wrapper over the singleton
// ---------------------------------------------------------------------------

export interface WebSocketState {
  connected: boolean;
  processes: ProcessSummary[];
}

export function useWebSocket() {
  // Start the shared connection on first mount (idempotent)
  useEffect(() => {
    manager.connect();
    // No cleanup - we want to keep the connection alive globally
  }, []);

  // Re-render when manager state changes
  const state = useSyncExternalStore(
    (cb) => manager.subscribe(cb),
    () => manager.state,
    () => ({ connected: false, processes: [] } satisfies WsManagerState)
  );

  const send = useCallback((msg: ClientMessage) => manager.send(msg), []);

  const addMessageHandler = useCallback((handler: MessageHandler) => {
    return manager.addHandler(handler);
  }, []);

  const subscribe = useCallback(
    (processId: string) => send({ type: 'subscribe', processId }),
    [send]
  );

  const unsubscribe = useCallback(
    (processId: string) => send({ type: 'unsubscribe', processId }),
    [send]
  );

  const sendInput = useCallback(
    (processId: string, data: string) => send({ type: 'input', processId, data }),
    [send]
  );

  const sendResize = useCallback(
    (processId: string, cols: number, rows: number) =>
      send({ type: 'resize', processId, cols, rows }),
    [send]
  );

  const sendToLeader = useCallback(
    (teamId: string, text: string) => send({ type: 'send_to_leader', teamId, text }),
    [send]
  );

  // Expose reconnect for manual trigger (e.g. "Reconnect" button)
  const reconnect = useCallback(() => {
    manager.disconnect();
    setTimeout(() => manager.connect(), 100);
  }, []);

  return {
    state,
    subscribe,
    unsubscribe,
    sendInput,
    sendResize,
    sendToLeader,
    addMessageHandler,
    reconnect,
  };
}
