export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { getBatchPreTranslateProgressAction } from '@/actions/batch-pre-translate';
import { guardMessage, guardStatus, requireUser } from '@/lib/guards';

export async function GET(req: Request) {
    try {
        await requireUser();
        const { searchParams } = new URL(req.url);
        const batchId = searchParams.get('batchId') || '';
        const res = await getBatchPreTranslateProgressAction(batchId);
        return NextResponse.json(res);
    } catch (e) {
        return NextResponse.json({ error: guardMessage(e) }, { status: guardStatus(e) });
    }
}
