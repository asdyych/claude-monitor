// POST /api/teams/:id/launch
import { NextRequest, NextResponse } from 'next/server';
import { TeamOrchestrator } from '@/services/team-orchestrator';
import { TeamLaunchOptions } from '@/types/team';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    const body = (await request.json().catch(() => ({}))) as TeamLaunchOptions;
    const orchestrator = TeamOrchestrator.getInstance();
    const result = await orchestrator.launchTeam(id, body);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
