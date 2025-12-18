export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { cancelBatchQAAction } from '@/actions/batch-quality-assure';

export async function POST(req: Request) {
    const body = await req.json();
    const batchId: string = body?.batchId;
    const res = await cancelBatchQAAction(batchId);
    return NextResponse.json(res);
}
