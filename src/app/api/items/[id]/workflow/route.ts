import { NextRequest, NextResponse } from 'next/server';
import { updateDocumentItemByIdDB } from '@/db/documentItem';
import { guardMessage, guardStatus, requireWritableDocumentItem } from '@/lib/guards';

export async function POST(req: NextRequest, context: any) {
    try {
        const { id } = (await context?.params) || {};
        const body = await req.json().catch(() => ({}));
        const status = String(body?.status || '').toUpperCase();
        if (!id || !status)
            return NextResponse.json({ success: false, error: 'missing params' }, { status: 400 });
        await requireWritableDocumentItem(id);
        const item = await updateDocumentItemByIdDB(id, { status } as any);
        return NextResponse.json({
            success: true,
            data: { id: (item as any).id, status: (item as any).status },
        });
    } catch (e: any) {
        return NextResponse.json(
            { success: false, error: guardMessage(e) },
            { status: guardStatus(e) }
        );
    }
}
