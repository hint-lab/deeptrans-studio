import { NextRequest, NextResponse } from 'next/server';
import { updateDocumentItemByIdDB } from '@/db/documentItem';

export async function POST(req: NextRequest, context: any) {
  try {
    const id = context?.params?.id as string;
    const body = await req.json().catch(() => ({}));
    const status = String(body?.status || '').toUpperCase();
    if (!id || !status) return NextResponse.json({ success: false, error: 'missing params' }, { status: 400 });
    const item = await updateDocumentItemByIdDB(id, { status } as any);
    return NextResponse.json({ success: true, data: { id: (item as any).id, status: (item as any).status } });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || String(e) }, { status: 500 });
  }
}


