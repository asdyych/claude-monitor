// Custom Next.js server with integrated WebSocket support
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer } from 'ws';
import { WsHandler } from './src/services/ws-handler';
import { PtyManager } from './src/services/pty-manager';

const PORT = parseInt(process.env.PORT || '13333', 10);
const isDev = process.env.NODE_ENV !== 'production';

async function main() {
  const app = next({ dev: isDev });
  const handle = app.getRequestHandler();

  await app.prepare();

  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws/terminal',
  });

  // Initialize WebSocket handler (attaches listeners to wss)
  new WsHandler(wss);

  // Graceful shutdown: kill all PTY processes on exit
  const shutdown = () => {
    console.log('\n🔴 [Server] Shutting down, killing all managed processes...');
    PtyManager.getInstance().killAll();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  httpServer.listen(PORT, () => {
    console.log(`✅ [Server] Running on http://localhost:${PORT}`);
    console.log(`🔌 [Server] WebSocket endpoint: ws://localhost:${PORT}/ws/terminal`);
  });
}

main().catch((err) => {
  console.error('❌ [Server] Failed to start:', err);
  process.exit(1);
});
