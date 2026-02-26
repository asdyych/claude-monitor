// GET /api/processes/managed - list all managed PTY processes
import { NextResponse } from 'next/server';
import { PtyManager } from '@/services/pty-manager';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const ptyManager = PtyManager.getInstance();
    const processes = ptyManager.getAll().map((p) => ({
      ...p,
      startedAt: p.startedAt.toISOString(),
    }));

    return NextResponse.json({ success: true, data: processes });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
