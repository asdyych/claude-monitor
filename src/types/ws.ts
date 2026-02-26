// WebSocket message protocol types

// Client -> Server messages
export type ClientMessage =
  | { type: 'subscribe'; processId: string }
  | { type: 'unsubscribe'; processId: string }
  | { type: 'input'; processId: string; data: string }
  | { type: 'resize'; processId: string; cols: number; rows: number };

// Server -> Client messages
export type ServerMessage =
  | { type: 'output'; processId: string; data: string }
  | { type: 'history'; processId: string; data: string }
  | { type: 'process_exit'; processId: string; exitCode: number }
  | { type: 'process_started'; processId: string; memberName: string; teamId: string }
  | { type: 'process_list'; processes: ProcessSummary[] }
  | { type: 'error'; message: string };

export interface ProcessSummary {
  id: string;
  teamId: string;
  memberName: string;
  pid: number;
  status: 'running' | 'exited';
  exitCode?: number;
  startedAt: string;
  cwd: string;
}
