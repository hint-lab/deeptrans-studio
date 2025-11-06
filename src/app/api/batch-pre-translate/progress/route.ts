export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { getBatchPreTranslateProgressAction } from '@/actions/batch-pre-translate';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const batchId = searchParams.get('batchId') || '';
  const res = await getBatchPreTranslateProgressAction(batchId);
  return NextResponse.json(res);
}


