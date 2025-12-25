export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { persistBatchQAResultsAction } from '@/actions/batch-quality-assure';

export async function POST(req: Request) {
    const body = await req.json();
    const batchId: string = body?.batchId;
    const res = await persistBatchQAResultsAction(batchId);
    return NextResponse.json(res);
}
