import { NextRequest, NextResponse } from 'next/server';
import { readSettings, writeSettings } from '@/lib/settings-store';
import { AppSettings } from '@/types/settings';

export async function GET() {
  try {
    const settings = await readSettings();
    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<AppSettings>;
    const current = await readSettings();
    const updated: AppSettings = { ...current, ...body };
    await writeSettings(updated);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
