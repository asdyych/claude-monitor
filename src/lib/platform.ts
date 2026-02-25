// Cross-platform types and interfaces

import type { ProcessInfo } from '@/types/process';
import type { ConnectionInfo } from '@/types/connection';
import { WindowsProcessAdapter } from './process-win32';
import { DarwinProcessAdapter } from './process-darwin';
import { LinuxProcessAdapter } from './process-linux';

export type Platform = 'win32' | 'darwin' | 'linux';

export interface ProcessAdapter {
  getProcesses(names: string[]): Promise<ProcessInfo[]>;
  killProcess(pid: number): Promise<boolean>;
}

export interface ConnectionAdapter {
  getConnections(port: number): Promise<{
    isListening: boolean;
    connections: ConnectionInfo[];
  }>;
}

export function getPlatform(): Platform {
  return process.platform as Platform;
}

export function isWindows(): boolean {
  return process.platform === 'win32';
}

export function isMacOS(): boolean {
  return process.platform === 'darwin';
}

export function isLinux(): boolean {
  return process.platform === 'linux';
}

// Factory function to create platform-specific process adapter
export function createProcessAdapter(): ProcessAdapter {
  const platform = getPlatform();
  switch (platform) {
    case 'win32':
      return new WindowsProcessAdapter();
    case 'darwin':
      return new DarwinProcessAdapter();
    case 'linux':
      return new LinuxProcessAdapter();
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

// Singleton instance
let processAdapterInstance: ProcessAdapter | null = null;

export function getProcessAdapter(): ProcessAdapter {
  if (!processAdapterInstance) {
    processAdapterInstance = createProcessAdapter();
  }
  return processAdapterInstance;
}
