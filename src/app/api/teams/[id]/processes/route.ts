// GET /api/teams/:id/processes
import { NextRequest, NextResponse } from 'next/server';
import { TeamOrchestrator } from '@/services/team-orchestrator';
import { PtyManager } from '@/services/pty-manager';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    const orchestrator = TeamOrchestrator.getInstance();
    const ptyManager = PtyManager.getInstance();

    const processIds = orchestrator.getTeamProcessIds(id);
    const processes = processIds
      .map((pid) => ptyManager.getById(pid))
      .filter(Boolean)
      .map((p) => ({
        ...p,
        startedAt: p!.startedAt.toISOString(),
      }));

    return NextResponse.json({ success: true, data: processes });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
