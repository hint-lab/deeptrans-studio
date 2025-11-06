export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { persistBatchPreTranslateResultsAction } from '@/actions/batch-pre-translate';

export async function POST(req: Request) {
  const body = await req.json();
  const batchId: string = body?.batchId;
  const res = await persistBatchPreTranslateResultsAction(batchId);
  return NextResponse.json(res);
}


