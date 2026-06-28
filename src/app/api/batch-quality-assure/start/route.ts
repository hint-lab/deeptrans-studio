export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { startBatchQAAction } from '@/actions/batch-quality-assure';
import { guardMessage, guardStatus, requireUser } from '@/lib/guards';

export async function POST(req: Request) {
    try {
        await requireUser();
        const body = await req.json();
        const itemIds: string[] = body?.itemIds || [];
        const targetLanguage: string | undefined = body?.targetLanguage;
        const domain: string | undefined = body?.domain;
        const res = await startBatchQAAction(itemIds, { targetLanguage, domain });
        return NextResponse.json(res);
    } catch (e) {
        return NextResponse.json({ error: guardMessage(e) }, { status: guardStatus(e) });
    }
}
