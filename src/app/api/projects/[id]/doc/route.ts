import { NextRequest, NextResponse } from 'next/server';
import { findDocumentsByProjectIdDB } from '@/db/document';

export async function GET(req: NextRequest, context: any) {
    try {
        const docs = await findDocumentsByProjectIdDB(context?.params?.id);
        const only = docs?.[0];
        if (!only) return NextResponse.json({ error: 'not found' }, { status: 404 });
        return NextResponse.json({ documentId: (only as any).id });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
    }
}
