// POST /api/processes/:id/kill
import { NextRequest, NextResponse } from 'next/server';
import { PtyManager } from '@/services/pty-manager';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    const ptyManager = PtyManager.getInstance();
    const proc = ptyManager.getById(id);

    if (!proc) {
      return NextResponse.json({ success: false, error: 'Process not found' }, { status: 404 });
    }

    ptyManager.kill(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
