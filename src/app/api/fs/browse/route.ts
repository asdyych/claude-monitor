import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

export interface FsEntry {
  name: string;
  path: string;
}

export interface BrowseResponse {
  current: string;
  parent: string | null;
  entries: FsEntry[];
  /** Windows drive roots when path is empty */
  drives?: string[];
}

function isWindows(): boolean {
  return process.platform === 'win32';
}

/** List available drive letters on Windows by probing A-Z */
async function listWindowsDrives(): Promise<string[]> {
  const drives: string[] = [];
  for (let i = 65; i <= 90; i++) {
    const drive = `${String.fromCharCode(i)}:\\`;
    try {
      await fs.access(drive);
      drives.push(drive);
    } catch {
      // drive not accessible
    }
  }
  return drives;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawPath = searchParams.get('path') ?? '';

    // Resolve starting directory
    let targetPath: string;
    if (!rawPath) {
      targetPath = os.homedir();
    } else {
      targetPath = path.resolve(rawPath);
    }

    // On Windows, if user navigates "up" from a drive root, show drive list
    if (isWindows() && rawPath === '__drives__') {
      const drives = await listWindowsDrives();
      const response: BrowseResponse = {
        current: '__drives__',
        parent: null,
        entries: [],
        drives,
      };
      return NextResponse.json({ success: true, data: response });
    }

    // Stat the target to ensure it's a directory
    const stat = await fs.stat(targetPath);
    if (!stat.isDirectory()) {
      return NextResponse.json({ success: false, error: 'Path is not a directory' }, { status: 400 });
    }

    // Read directory contents, filter to directories only
    const items = await fs.readdir(targetPath, { withFileTypes: true });
    const entries: FsEntry[] = [];
    for (const item of items) {
      if (!item.isDirectory()) continue;
      // Skip hidden / system dirs
      if (item.name.startsWith('.') || item.name === '$Recycle.Bin' || item.name === 'System Volume Information') continue;
      entries.push({
        name: item.name,
        path: path.join(targetPath, item.name),
      });
    }
    entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    // Compute parent
    const parentPath = path.dirname(targetPath);
    let parent: string | null;
    if (isWindows()) {
      // At a drive root (e.g. C:\), dirname returns itself → go to drive list
      if (parentPath === targetPath) {
        parent = '__drives__';
      } else {
        parent = parentPath;
      }
    } else {
      parent = parentPath !== targetPath ? parentPath : null;
    }

    const response: BrowseResponse = { current: targetPath, parent, entries };
    return NextResponse.json({ success: true, data: response });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
