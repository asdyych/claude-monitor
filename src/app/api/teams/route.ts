import { NextResponse } from 'next/server';
import { getAllTeamsState } from '@/services/team-service';

export async function GET() {
  try {
    const teams = await getAllTeamsState();
    return NextResponse.json({
      success: true,
      data: teams,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Failed to get teams:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve teams' },
      { status: 500 }
    );
  }
}
