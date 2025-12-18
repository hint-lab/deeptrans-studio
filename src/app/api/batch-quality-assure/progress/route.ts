export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { getBatchQAProgressAction } from '@/actions/batch-quality-assure';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const batchId = searchParams.get('batchId') || '';
    const res = await getBatchQAProgressAction(batchId);
    return NextResponse.json(res);
}
