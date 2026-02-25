// Windows-specific process monitoring implementation

import { execFile } from 'child_process';
import { promisify } from 'util';
import { ProcessInfo } from '@/types/process';
import { ProcessAdapter } from './platform';

const execFileAsync = promisify(execFile);

interface Win32Process {
  ProcessId: number;
  Name: string;
  PercentProcessorTime: number;
  WorkingSetPrivate: number;
  CommandLine: string;
  CreationDate: string | null;
}

export class WindowsProcessAdapter implements ProcessAdapter {
  async getProcesses(names: string[]): Promise<ProcessInfo[]> {
    // Build pattern for WMI (e.g., "node*" for -like operator)
    const likePatterns = names.map(n => `'${n}*'`).join(',');

    // Build regex pattern for process name matching (e.g., "^(node|python)")
    const matchPattern = `'^(${names.join('|')})'`;

    const script = `
$patterns = @(${likePatterns})
$matchPattern = ${matchPattern}

$procs = Get-WmiObject Win32_PerfFormattedData_PerfProc_Process | Where-Object {
  $name = $_.Name -replace '#\d+$', ''
  $patterns | Where-Object { $name -like $_ }
}

$cmdLines = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -match $matchPattern
}

$results = @()
foreach ($p in $procs) {
  $cmd = $cmdLines | Where-Object { $_.ProcessId -eq $p.IDProcess } | Select-Object -First 1
  $obj = [PSCustomObject]@{
    ProcessId = $p.IDProcess
    Name = ($p.Name -replace '#\d+$', '')
    PercentProcessorTime = [int]$p.PercentProcessorTime
    WorkingSetPrivate = [int64]$p.WorkingSetPrivate
    CommandLine = $(if ($cmd) { $cmd.CommandLine } else { $p.Name })
    CreationDate = $(if ($cmd) { $cmd.CreationDate } else { $null })
  }
  $results += $obj
}

if ($results.Count -eq 0) { '[]' } else { $results | ConvertTo-Json -Depth 2 -Compress }
    `.trim();

    try {
      const { stdout, stderr } = await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
        { timeout: 15000 }
      );

      if (!stdout.trim() || stdout.trim() === '[]') {
        return [];
      }

      let parsed: Win32Process[] = [];
      try {
        const json = JSON.parse(stdout);
        parsed = Array.isArray(json) ? json : [json];
      } catch (parseError) {
        console.error('Failed to parse PowerShell output:', stdout.substring(0, 200));
        return [];
      }

      return parsed.map(p => ({
        pid: p.ProcessId,
        name: p.Name,
        cpu: p.PercentProcessorTime || 0,
        memory: Math.round((p.WorkingSetPrivate || 0) / (1024 * 1024)),
        startTime: p.CreationDate ? this.parseWmiDate(p.CreationDate) : new Date(),
        command: p.CommandLine || p.Name,
        status: 'running' as const
      })).sort((a, b) => b.cpu - a.cpu);
    } catch (error) {
      console.error('Windows process fetch error:', error);
      return [];
    }
  }

  async killProcess(pid: number): Promise<boolean> {
    try {
      await execFileAsync('taskkill', ['/F', '/PID', String(pid)]);
      return true;
    } catch (error) {
      console.error(`Failed to kill process ${pid}:`, error);
      return false;
    }
  }

  private parseWmiDate(wmiDate: string): Date {
    // WMI date format: 20240115120000.000000+480
    const match = wmiDate.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
    if (match) {
      const [, year, month, day, hour, minute, second] = match;
      return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
    }
    return new Date();
  }
}
