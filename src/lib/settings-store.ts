import { promises as fs } from 'fs';
import path from 'path';
import { AppSettings, DEFAULT_SETTINGS } from '@/types/settings';

const SETTINGS_FILE = path.join(process.cwd(), 'data', 'settings.json');

async function ensureDataDir(): Promise<void> {
  const dir = path.dirname(SETTINGS_FILE);
  await fs.mkdir(dir, { recursive: true });
}

export async function readSettings(): Promise<AppSettings> {
  try {
    const raw = await fs.readFile(SETTINGS_FILE, 'utf-8');
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function writeSettings(settings: AppSettings): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
}
