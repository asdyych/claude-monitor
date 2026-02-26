import { NextRequest, NextResponse } from 'next/server';
import { getAllTeamsState } from '@/services/team-service';
import { TeamOrchestrator } from '@/services/team-orchestrator';
import { TeamCreateRequest } from '@/types/team';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const teams = await getAllTeamsState();
    const orchestrator = TeamOrchestrator.getInstance();

    const teamsWithStatus = teams.map((team) => ({
      ...team,
      isRunning: orchestrator.isTeamRunning(team.id),
      processIds: orchestrator.getTeamProcessIds(team.id),
    }));

    return NextResponse.json({
      success: true,
      data: teamsWithStatus,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Failed to get teams:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve teams' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as TeamCreateRequest;

    if (!body.name || !body.cwd || !body.members?.length) {
      return NextResponse.json(
        { success: false, error: 'name, cwd, and members are required' },
        { status: 400 }
      );
    }

    const orchestrator = TeamOrchestrator.getInstance();
    const teamId = await orchestrator.createTeam(body);

    if (body.launchImmediately) {
      await orchestrator.launchTeam(teamId, { env: body.env });
    }

    return NextResponse.json({ success: true, data: { teamId } }, { status: 201 });
  } catch (error) {
    console.error('Failed to create team:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
