export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { startBatchPreTranslateAction } from '@/actions/batch-pre-translate';
import { guardMessage, guardStatus, requireUser } from '@/lib/guards';

export async function POST(req: Request) {
    try {
        await requireUser();
        const body = await req.json();
        const itemIds: string[] = body?.itemIds || [];
        const sourceLanguage: string | undefined = body?.sourceLanguage;
        const targetLanguage: string | undefined = body?.targetLanguage;
        const res = await startBatchPreTranslateAction(itemIds, { sourceLanguage, targetLanguage });
        return NextResponse.json(res);
    } catch (e) {
        return NextResponse.json({ error: guardMessage(e) }, { status: guardStatus(e) });
    }
}
