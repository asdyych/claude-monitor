// Managed PTY process types

export interface ManagedProcess {
  id: string;
  teamId: string;
  memberName: string;
  pid: number;
  status: 'running' | 'exited';
  exitCode?: number;
  startedAt: Date;
  cwd: string;
  command: string;
  cols: number;
  rows: number;
}

export interface SpawnOptions {
  id: string;
  teamId: string;
  memberName: string;
  command: string;
  args?: string[];
  cwd: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}
