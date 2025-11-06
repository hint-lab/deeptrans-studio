export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { startBatchQAAction } from '@/actions/batch-quality-assure';

export async function POST(req: Request) {
  const body = await req.json();
  const itemIds: string[] = body?.itemIds || [];
  const targetLanguage: string | undefined = body?.targetLanguage;
  const domain: string | undefined = body?.domain;
  const tenantId: string | undefined = body?.tenantId;
  const res = await startBatchQAAction(itemIds, { targetLanguage, domain, tenantId });
  return NextResponse.json(res);
}


