// App constants
export const PROXY_PORT = 15721;
export const POLL_INTERVAL = 2000; // 2 seconds
export const HEARTBEAT_INTERVAL = 15000; // 15 seconds
export const RECONNECT_DELAY = 3000; // 3 seconds
export const MESSAGE_PREVIEW_LIMIT = 5;

// Monitored process names (cross-platform)
// Can be overridden via environment variable: MONITORED_PROCESSES=claude,node
export const MONITORED_PROCESS_NAMES: string[] = (
  process.env.MONITORED_PROCESSES || 'claude'
).split(',').map(s => s.trim()).filter(Boolean);

export const STATUS_COLORS = {
  active: 'bg-green-500',
  idle: 'bg-yellow-500',
  offline: 'bg-gray-400',
  error: 'bg-red-500',
} as const;

export const STATUS_TEXT = {
  active: 'Active',
  idle: 'Idle',
  offline: 'Offline',
  error: 'Error',
} as const;
