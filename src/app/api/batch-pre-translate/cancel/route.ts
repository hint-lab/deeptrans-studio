export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { cancelBatchPreTranslateAction } from '@/actions/batch-pre-translate';
import { guardMessage, guardStatus, requireUser } from '@/lib/guards';

export async function POST(req: Request) {
    try {
        await requireUser();
        const body = await req.json();
        const batchId: string = body?.batchId;
        return NextResponse.json(await cancelBatchPreTranslateAction(batchId));
    } catch (error) {
        return NextResponse.json({ error: guardMessage(error) }, { status: guardStatus(error) });
    }
}
