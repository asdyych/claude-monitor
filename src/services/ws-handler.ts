// WebSocket handler - manages WS connections and routes messages to PtyManager
import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { PtyManager } from './pty-manager';
import { TeamOrchestrator } from './team-orchestrator';
import { ClientMessage, ServerMessage, ProcessSummary } from '@/types/ws';
import { ManagedProcess } from '@/types/managed-process';

function toProcessSummary(p: ManagedProcess): ProcessSummary {
  return {
    id: p.id,
    teamId: p.teamId,
    memberName: p.memberName,
    pid: p.pid,
    status: p.status,
    exitCode: p.exitCode,
    startedAt: p.startedAt.toISOString(),
    cwd: p.cwd,
  };
}

function safeSend(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // ignore send errors on closed sockets
    }
  }
}

// Use globalThis so the WsHandler instance survives module re-evaluation
const _gWs = globalThis as typeof globalThis & { __wsHandlerInstance?: WsHandler };

export class WsHandler {
  private wss: WebSocketServer;
  private ptyManager: PtyManager;
  private teamOrchestrator: TeamOrchestrator;
  // Map from processId -> Set of subscribed WebSockets
  private subscriptions = new Map<string, Set<WebSocket>>();
  // Map from WebSocket -> Set of processIds it's subscribed to
  private clientSubs = new Map<WebSocket, Set<string>>();
  // cleanup callbacks per processId
  private processListeners = new Map<string, () => void>();

  constructor(wss: WebSocketServer) {
    this.wss = wss;
    this.ptyManager = PtyManager.getInstance();
    this.teamOrchestrator = TeamOrchestrator.getInstance();
    this.setupGlobalListeners();
    this.wss.on('connection', this.handleConnection.bind(this));
    console.log('🔌 [WsHandler] WebSocket handler initialized');
  }

  private setupGlobalListeners(): void {
    // Relay all new process data to subscribers
    this.ptyManager.onAnyData((id, data) => {
      this.broadcast(id, { type: 'output', processId: id, data });
    });

    this.ptyManager.onAnyExit((id, exitCode) => {
      this.broadcast(id, { type: 'process_exit', processId: id, exitCode });
    });

    this.ptyManager.onProcessStarted((id, proc) => {
      // Notify all connected clients about new process
      const msg: ServerMessage = {
        type: 'process_started',
        processId: id,
        memberName: proc.memberName,
        teamId: proc.teamId,
      };
      this.wss.clients.forEach((ws) => safeSend(ws, msg));
    });

    this.teamOrchestrator.onDispatchUpdate((update) => {
      const msg: ServerMessage = {
        type: 'dispatch_update',
        teamId: update.teamId,
        taskId: update.taskId,
        memberName: update.memberName,
        status: update.status,
        detail: update.detail,
      };
      this.wss.clients.forEach((ws) => safeSend(ws, msg));
    });
  }

  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const clientIp = req.socket.remoteAddress;
    console.log(`🔌 [WsHandler] Client connected from ${clientIp}`);

    this.clientSubs.set(ws, new Set());

    // Send current process list on connect
    const processes = this.ptyManager.getAll().map(toProcessSummary);
    safeSend(ws, { type: 'process_list', processes });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as ClientMessage;
        this.handleMessage(ws, msg);
      } catch (err) {
        safeSend(ws, { type: 'error', message: `Invalid message: ${err}` });
      }
    });

    ws.on('close', () => {
      this.handleDisconnect(ws);
    });

    ws.on('error', (err) => {
      console.error(`[WsHandler] WebSocket error: ${err.message}`);
      this.handleDisconnect(ws);
    });
  }

  private handleMessage(ws: WebSocket, msg: ClientMessage): void {
    switch (msg.type) {
      case 'subscribe':
        this.subscribe(ws, msg.processId);
        break;
      case 'unsubscribe':
        this.unsubscribe(ws, msg.processId);
        break;
      case 'input':
        this.handleInput(ws, msg.processId, msg.data);
        break;
      case 'resize':
        this.handleResize(msg.processId, msg.cols, msg.rows);
        break;
      case 'send_to_leader':
        this.handleSendToLeader(ws, msg.teamId, msg.text);
        break;
      default:
        safeSend(ws, { type: 'error', message: 'Unknown message type' });
    }
  }

  private handleSendToLeader(ws: WebSocket, teamId: string, text: string): void {
    try {
      const leaderProcessId = this.teamOrchestrator.getLeaderProcessId(teamId);
      if (!leaderProcessId) {
        safeSend(ws, {
          type: 'leader_ack',
          teamId,
          accepted: false,
          message: `Leader process not found for team "${teamId}"`,
        });
        return;
      }

      const result = this.teamOrchestrator.sendUserMessageToLeader(teamId, text);
      safeSend(ws, {
        type: 'leader_ack',
        teamId,
        accepted: result.accepted,
        message: result.message,
      });
    } catch (err) {
      safeSend(ws, {
        type: 'leader_ack',
        teamId,
        accepted: false,
        message: `Failed to send message: ${String(err)}`,
      });
    }
  }

  private subscribe(ws: WebSocket, processId: string): void {
    const proc = this.ptyManager.getById(processId);
    if (!proc) {
      safeSend(ws, { type: 'error', message: `Process "${processId}" not found` });
      return;
    }

    // Add to subscriptions
    if (!this.subscriptions.has(processId)) {
      this.subscriptions.set(processId, new Set());
    }
    this.subscriptions.get(processId)!.add(ws);
    this.clientSubs.get(ws)?.add(processId);

    // Send buffered history immediately
    const history = this.ptyManager.getHistory(processId);
    if (history) {
      safeSend(ws, { type: 'history', processId, data: history });
    }

    console.log(`📺 [WsHandler] Client subscribed to process "${processId}"`);
  }

  private unsubscribe(ws: WebSocket, processId: string): void {
    this.subscriptions.get(processId)?.delete(ws);
    this.clientSubs.get(ws)?.delete(processId);
  }

  private handleInput(ws: WebSocket, processId: string, data: string): void {
    // Only allow input if client is subscribed to this process
    if (!this.clientSubs.get(ws)?.has(processId)) {
      safeSend(ws, { type: 'error', message: 'Not subscribed to this process' });
      return;
    }
    try {
      this.ptyManager.write(processId, data);
    } catch (err) {
      safeSend(ws, { type: 'error', message: `Failed to write: ${err}` });
    }
  }

  private handleResize(processId: string, cols: number, rows: number): void {
    this.ptyManager.resize(processId, cols, rows);
  }

  private handleDisconnect(ws: WebSocket): void {
    const subs = this.clientSubs.get(ws);
    if (subs) {
      for (const processId of Array.from(subs)) {
        this.subscriptions.get(processId)?.delete(ws);
      }
    }
    this.clientSubs.delete(ws);
    console.log('🔌 [WsHandler] Client disconnected');
  }

  private broadcast(processId: string, msg: ServerMessage): void {
    const clients = this.subscriptions.get(processId);
    if (!clients || clients.size === 0) return;
    for (const ws of Array.from(clients)) {
      safeSend(ws, msg);
    }
  }
}
