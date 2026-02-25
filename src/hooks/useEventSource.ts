'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { MonitorState, SSEUpdateData } from '@/types/events';

const EVENTS_URL = '/api/events';

const initialState: MonitorState = {
  processes: [],
  proxyStatus: {
    port: 15721,
    isListening: false,
    activeConnections: 0,
    connections: [],
    lastChecked: new Date()
  },
  teams: [],
  lastUpdated: new Date(),
  connected: false
};

export function useEventSource() {
  const [state, setState] = useState<MonitorState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    console.log('[SSE] Connecting to', EVENTS_URL);
    const eventSource = new EventSource(EVENTS_URL);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('[SSE] Connection opened');
      setError(null);
      reconnectAttemptsRef.current = 0;
      setState(prev => ({ ...prev, connected: true }));
    };

    eventSource.addEventListener('init', (e: MessageEvent) => {
      console.log('[SSE] Received init event');
      try {
        const data = JSON.parse(e.data) as SSEUpdateData;
        console.log('[SSE] Init data:', { processes: data.processes?.length, teams: data.teams?.length });
        setState(prev => ({
          ...prev,
          processes: data.processes || [],
          proxyStatus: data.proxyStatus || prev.proxyStatus,
          teams: data.teams || [],
          connected: true,
          lastUpdated: new Date()
        }));
      } catch (err) {
        console.error('[SSE] Failed to parse init event:', err);
      }
    });

    eventSource.addEventListener('update', (e: MessageEvent) => {
      console.log('[SSE] Received update event');
      try {
        const data = JSON.parse(e.data) as SSEUpdateData;
        setState(prev => ({
          ...prev,
          processes: data.processes || [],
          proxyStatus: data.proxyStatus || prev.proxyStatus,
          teams: data.teams || [],
          lastUpdated: new Date()
        }));
      } catch (err) {
        console.error('[SSE] Failed to parse update event:', err);
      }
    });

    eventSource.addEventListener('error', (e: MessageEvent) => {
      console.log('[SSE] Received error event:', e.data);
      try {
        const data = JSON.parse(e.data);
        setError(data.message);
      } catch {
        // Not a data error
      }
    });

    eventSource.onerror = (e) => {
      console.error('[SSE] Connection error:', e);
      setState(prev => ({ ...prev, connected: false }));
      eventSource.close();

      // Exponential backoff for reconnection
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
      reconnectAttemptsRef.current++;
      console.log(`[SSE] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);

      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, delay);
    };
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  return { state, error, reconnect: connect };
}
