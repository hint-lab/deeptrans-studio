export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { fetchProjectTabsAction } from '@/actions/explorer-tabs';
import { getExplorerTabsApiErrorMessage } from '@/lib/explorer-tabs-api-error';
import { guardMessage, guardStatus, requireUser } from '@/lib/guards';

export async function GET(req: Request) {
    try {
        await requireUser();
        const { searchParams } = new URL(req.url);
        const projectId = searchParams.get('projectId') || '';
        const tabs = await fetchProjectTabsAction(projectId);
        return NextResponse.json(tabs);
    } catch (e) {
        const status = guardStatus(e);
        return NextResponse.json(
            { error: getExplorerTabsApiErrorMessage(status, guardMessage(e)) },
            { status }
        );
    }
}
