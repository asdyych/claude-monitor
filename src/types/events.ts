// SSE event types
import { ProcessInfo } from './process';
import { ProxyStatus } from './connection';
import { TeamState } from './team';

export type EventType =
  | 'init'
  | 'update'
  | 'error'
  | 'heartbeat';

export interface SSEEvent {
  type: EventType;
  timestamp: Date;
  data: unknown;
}

export interface MonitorState {
  processes: ProcessInfo[];
  proxyStatus: ProxyStatus;
  teams: TeamState[];
  lastUpdated: Date;
  connected: boolean;
}

export interface SSEUpdateData {
  processes: ProcessInfo[];
  proxyStatus: ProxyStatus;
  teams: TeamState[];
  timestamp: Date;
}
