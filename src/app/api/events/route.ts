import { NextRequest } from 'next/server';
import { getProcesses } from '@/services/process-service';
import { getProxyStatus } from '@/services/connection-service';
import { getAllTeamsState } from '@/services/team-service';
import { POLL_INTERVAL, HEARTBEAT_INTERVAL } from '@/lib/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      let interval: ReturnType<typeof setInterval> | null = null;
      let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

      const sendEvent = (type: string, data: unknown) => {
        if (closed) return;
        try {
          const event = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(event));
        } catch {
          closed = true;
        }
      };

      const sendHeartbeat = () => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          closed = true;
        }
      };

      cleanup = () => {
        if (closed) return;
        closed = true;
        if (interval) clearInterval(interval);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
      };

      request.signal.addEventListener('abort', cleanup);

      // Initial full state
      try {
        const [processes, proxyStatus, teams] = await Promise.all([
          getProcesses(),
          getProxyStatus(15721),
          getAllTeamsState()
        ]);

        sendEvent('init', {
          processes,
          proxyStatus,
          teams,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Initial state error:', error);
        sendEvent('error', { message: 'Failed to fetch initial state' });
      }

      if (closed) return;

      // Polling loop
      interval = setInterval(async () => {
        if (closed) {
          if (interval) clearInterval(interval);
          return;
        }
        try {
          const [processes, proxyStatus, teams] = await Promise.all([
            getProcesses(),
            getProxyStatus(15721),
            getAllTeamsState()
          ]);

          sendEvent('update', {
            processes,
            proxyStatus,
            teams,
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          console.error('Polling error:', error);
          sendEvent('error', { message: 'Polling failed' });
        }
      }, POLL_INTERVAL);

      // Heartbeat every 15 seconds
      heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
    },
    cancel() {
      cleanup?.();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  });
}
