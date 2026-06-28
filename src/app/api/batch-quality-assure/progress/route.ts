export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { getBatchQAProgressAction } from '@/actions/batch-quality-assure';
import { guardMessage, guardStatus, requireUser } from '@/lib/guards';

export async function GET(req: Request) {
    try {
        await requireUser();
        const { searchParams } = new URL(req.url);
        const batchId = searchParams.get('batchId') || '';
        const res = await getBatchQAProgressAction(batchId);
        return NextResponse.json(res);
    } catch (e) {
        return NextResponse.json({ error: guardMessage(e) }, { status: guardStatus(e) });
    }
}
