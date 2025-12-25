export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { fetchProjectTabsAction } from '@/actions/explorer-tabs';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId') || '';
    const tabs = await fetchProjectTabsAction(projectId);
    return NextResponse.json(tabs);
}
