// PowerShell execution utilities
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function runPowerShell(script: string): Promise<string> {
  const escapedScript = script.replace(/"/g, '\\"');
  const { stdout } = await execAsync(
    `powershell.exe -NoProfile -Command "${escapedScript}"`,
    {
      maxBuffer: 1024 * 1024,
      timeout: 10000
    }
  );
  return stdout;
}

export function parseCsvOutput<T>(output: string): T[] {
  const lines = output.trim().split('\r\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split(',');
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = values[i]?.trim() || '';
    });
    return obj as unknown as T;
  });
}
