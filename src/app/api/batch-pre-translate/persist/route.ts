export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { persistBatchPreTranslateResultsAction } from '@/actions/batch-pre-translate';
import { guardMessage, guardStatus, requireUser } from '@/lib/guards';

export async function POST(req: Request) {
    try {
        await requireUser();
        const body = await req.json();
        const batchId: string = body?.batchId;
        const res = await persistBatchPreTranslateResultsAction(batchId);
        return NextResponse.json(res);
    } catch (e) {
        return NextResponse.json({ error: guardMessage(e) }, { status: guardStatus(e) });
    }
}
