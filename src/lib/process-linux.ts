// Linux-specific process monitoring implementation

import { exec } from 'child_process';
import { promisify } from 'util';
import { ProcessInfo } from '@/types/process';
import { ProcessAdapter } from './platform';

const execAsync = promisify(exec);

export class LinuxProcessAdapter implements ProcessAdapter {
  async getProcesses(names: string[]): Promise<ProcessInfo[]> {
    const pattern = names.join('|');

    try {
      // Use ps to get process info on Linux
      const { stdout } = await execAsync(
        `ps -eo pid,comm,%cpu,rss,cmd,etimes 2>/dev/null | grep -E '${pattern}' || true`
      );

      if (!stdout.trim()) {
        return [];
      }

      const processes: ProcessInfo[] = [];
      const lines = stdout.trim().split('\n');

      for (const line of lines) {
        // Skip the grep process itself
        if (line.includes('grep')) continue;

        const parts = line.trim().split(/\s+/);
        if (parts.length < 6) continue;

        const pid = parseInt(parts[0], 10);
        const name = parts[1];
        const cpu = parseFloat(parts[2]) || 0;
        const rss = parseInt(parts[3], 10) || 0; // in KB
        const etimes = parseInt(parts[parts.length - 1], 10) || 0;
        const command = parts.slice(4, -1).join(' ');

        processes.push({
          pid,
          name,
          cpu,
          memory: Math.round(rss / 1024), // KB to MB
          startTime: new Date(Date.now() - etimes * 1000),
          command,
          status: 'running'
        });
      }

      return processes.sort((a, b) => b.cpu - a.cpu);
    } catch (error) {
      console.error('Linux process fetch error:', error);
      return [];
    }
  }

  async killProcess(pid: number): Promise<boolean> {
    try {
      await execAsync(`kill -9 ${pid}`);
      return true;
    } catch (error) {
      console.error(`Failed to kill process ${pid}:`, error);
      return false;
    }
  }
}
