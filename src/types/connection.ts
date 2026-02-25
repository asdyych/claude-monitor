// Connection-related types
export interface ConnectionInfo {
  localPort: number;
  remoteAddress: string;
  remotePort: number;
  state: 'ESTABLISHED' | 'TIME_WAIT' | 'LISTEN' | 'CLOSE_WAIT';
  pid?: number;
}

export interface ProxyStatus {
  port: number;
  isListening: boolean;
  activeConnections: number;
  connections: ConnectionInfo[];
  lastChecked: Date;
}
