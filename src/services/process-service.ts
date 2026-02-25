// Process data collection service - Cross-platform
import { getProcessAdapter } from '@/lib/platform';
import { ProcessInfo } from '@/types/process';
import { MONITORED_PROCESS_NAMES } from '@/lib/constants';

export async function getProcesses(): Promise<ProcessInfo[]> {
  const adapter = getProcessAdapter();
  return adapter.getProcesses(MONITORED_PROCESS_NAMES);
}

export async function killProcess(pid: number): Promise<boolean> {
  const adapter = getProcessAdapter();
  return adapter.killProcess(pid);
}
