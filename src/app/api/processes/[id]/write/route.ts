// POST /api/processes/:id/write - Write data to PTY stdin
import { NextRequest, NextResponse } from 'next/server';
import { PtyManager } from '@/services/pty-manager';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    const body = await req.json() as { data: string };
    if (!body.data) {
      return NextResponse.json({ success: false, error: 'Missing data field' }, { status: 400 });
    }

    const ptyManager = PtyManager.getInstance();
    const proc = ptyManager.getById(id);

    if (!proc) {
      return NextResponse.json({ success: false, error: 'Process not found' }, { status: 404 });
    }

    ptyManager.write(id, body.data);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
