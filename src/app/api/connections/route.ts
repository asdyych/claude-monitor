import { NextResponse } from 'next/server';
import { getProxyStatus } from '@/services/connection-service';

export async function GET() {
  try {
    const status = await getProxyStatus(15721);
    return NextResponse.json({
      success: true,
      data: status,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Failed to get connections:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to check connections' },
      { status: 500 }
    );
  }
}
