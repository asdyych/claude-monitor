// Process-related types
export interface ProcessInfo {
  pid: number;
  name: string;
  cpu: number;           // Percentage
  memory: number;        // MB
  startTime: Date;
  command: string;
  status: 'running' | 'stopped' | 'unknown';
}

export interface ProcessMetrics {
  totalCpu: number;
  totalMemory: number;
  count: number;
}
