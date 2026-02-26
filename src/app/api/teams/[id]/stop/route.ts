// POST /api/teams/:id/stop
import { NextRequest, NextResponse } from 'next/server';
import { TeamOrchestrator } from '@/services/team-orchestrator';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    const orchestrator = TeamOrchestrator.getInstance();
    orchestrator.stopTeam(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
