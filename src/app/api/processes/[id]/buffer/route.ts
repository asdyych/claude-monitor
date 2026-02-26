// GET /api/processes/:id/buffer - Get ring buffer content for debugging
import { NextRequest, NextResponse } from 'next/server';
import { PtyManager } from '@/services/pty-manager';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    const ptyManager = PtyManager.getInstance();
    const proc = ptyManager.getById(id);

    if (!proc) {
      return NextResponse.json({ success: false, error: 'Process not found' }, { status: 404 });
    }

    const buffer = ptyManager.getHistory(id);
    return NextResponse.json({
      success: true,
      data: {
        id,
        status: proc.status,
        bufferLength: buffer.length,
        bufferPreview: buffer.slice(-800),
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
