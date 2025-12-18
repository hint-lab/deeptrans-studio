export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { startBatchPreTranslateAction } from '@/actions/batch-pre-translate';

export async function POST(req: Request) {
    const body = await req.json();
    const itemIds: string[] = body?.itemIds || [];
    const sourceLanguage: string | undefined = body?.sourceLanguage;
    const targetLanguage: string | undefined = body?.targetLanguage;
    const res = await startBatchPreTranslateAction(itemIds, { sourceLanguage, targetLanguage });
    return NextResponse.json(res);
}
