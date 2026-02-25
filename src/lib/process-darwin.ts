// macOS/Darwin-specific process monitoring implementation

import { exec } from 'child_process';
import { promisify } from 'util';
import { ProcessInfo } from '@/types/process';
import { ProcessAdapter } from './platform';

const execAsync = promisify(exec);

interface DarwinProcess {
  pid: number;
  name: string;
  cpu: number;
  memRss: number;
  command: string;
  etime: string;
}

export class DarwinProcessAdapter implements ProcessAdapter {
  async getProcesses(names: string[]): Promise<ProcessInfo[]> {
    // Build process name pattern for pgrep
    const pattern = names.join('|');

    try {
      // Get PIDs matching the names
      const { stdout: pgrepOut } = await execAsync(`pgrep -f '${pattern}' 2>/dev/null || true`);
      const pids = pgrepOut.trim().split('\n').filter(Boolean);

      if (pids.length === 0) {
        return [];
      }

      // Get process details using ps
      // %cpu = CPU percentage, rss = resident set size in KB, etime = elapsed time
      const pidList = pids.join(',');
      const { stdout: psOut } = await execAsync(
        `ps -p ${pidList} -o pid=,comm=,%cpu=,rss=,command=,etime= 2>/dev/null || true`
      );

      if (!psOut.trim()) {
        return [];
      }

      const processes: DarwinProcess[] = psOut.trim().split('\n').map(line => {
        // ps output columns: pid, comm, %cpu, rss, command, etime
        const parts = line.trim().split(/\s+/);
        const pid = parseInt(parts[0], 10);
        const comm = parts[1];
        const cpu = parseFloat(parts[2]) || 0;
        const rss = parseInt(parts[3], 10) || 0; // in KB

        // etime is the last field, command is everything between rss and etime
        const etime = parts[parts.length - 1];
        const commandParts = parts.slice(4, -1);
        const command = commandParts.length > 0 ? commandParts.join(' ') : comm;

        return { pid, name: comm, cpu, memRss: rss, command, etime };
      });

      return processes.map(p => ({
        pid: p.pid,
        name: p.name,
        cpu: p.cpu,
        memory: Math.round(p.memRss / 1024), // KB to MB
        startTime: this.parseEtime(p.etime),
        command: p.command,
        status: 'running' as const
      })).sort((a, b) => b.cpu - a.cpu);
    } catch (error) {
      console.error('macOS process fetch error:', error);
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

  private parseEtime(etime: string): Date {
    // etime format: [[DD-]HH:]MM:SS or MM:SS
    const now = new Date();
    let seconds = 0;

    const parts = etime.split('-');
    if (parts.length === 2) {
      // Has days: DD-HH:MM:SS
      seconds += parseInt(parts[0], 10) * 86400;
      const timeParts = parts[1].split(':');
      if (timeParts.length === 3) {
        seconds += parseInt(timeParts[0], 10) * 3600;
        seconds += parseInt(timeParts[1], 10) * 60;
        seconds += parseInt(timeParts[2], 10);
      }
    } else {
      // No days: HH:MM:SS or MM:SS
      const timeParts = etime.split(':');
      if (timeParts.length === 3) {
        seconds += parseInt(timeParts[0], 10) * 3600;
        seconds += parseInt(timeParts[1], 10) * 60;
        seconds += parseInt(timeParts[2], 10);
      } else if (timeParts.length === 2) {
        seconds += parseInt(timeParts[0], 10) * 60;
        seconds += parseInt(timeParts[1], 10);
      }
    }

    return new Date(now.getTime() - seconds * 1000);
  }
}
