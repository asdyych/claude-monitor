// GET /api/teams/:id  PUT /api/teams/:id  DELETE /api/teams/:id
import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { getAllTeamsState } from '@/services/team-service';
import { TeamOrchestrator } from '@/services/team-orchestrator';

export const runtime = 'nodejs';

const TEAMS_DIR = join(homedir(), '.claude', 'teams');

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    const teams = await getAllTeamsState();
    const team = teams.find((t) => t.id === id);

    if (!team) {
      return NextResponse.json({ success: false, error: 'Team not found' }, { status: 404 });
    }

    const orchestrator = TeamOrchestrator.getInstance();
    return NextResponse.json({
      success: true,
      data: {
        ...team,
        isRunning: orchestrator.isTeamRunning(id),
        processIds: orchestrator.getTeamProcessIds(id),
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    const configPath = join(TEAMS_DIR, id, 'config.json');
    const existing = JSON.parse(await readFile(configPath, 'utf-8'));
    const updates = await request.json();

    const updated = { ...existing, ...updates };
    await writeFile(configPath, JSON.stringify(updated, null, 2), 'utf-8');

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    const orchestrator = TeamOrchestrator.getInstance();
    await orchestrator.destroyTeam(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
