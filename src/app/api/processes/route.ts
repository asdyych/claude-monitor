import { NextResponse } from 'next/server';
import { getProcesses } from '@/services/process-service';

export async function GET() {
  try {
    const processes = await getProcesses();
    return NextResponse.json({
      success: true,
      data: processes,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Failed to get processes:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve processes' },
      { status: 500 }
    );
  }
}
