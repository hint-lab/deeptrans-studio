import { NextResponse } from 'next/server';
import { GuardError, requireOwnedDocumentItem, requireUser } from '@/lib/guards';
import {
    DOCUMENT_SOURCE_RETRY_MESSAGE,
    getReadableDocumentSourceBufferForOwner,
} from '@/server/uploaded-object';

export async function GET(
    _request: Request,
    context: { params: Promise<{ itemId: string }> }
) {
    try {
        const { itemId } = await context.params;
        if (!itemId) return NextResponse.json({ error: 'Missing itemId' }, { status: 400 });
        const authCtx = await requireUser();
        const item = await requireOwnedDocumentItem(itemId, authCtx);
        if (!item || !item.document)
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        const doc: any = item.document;
        const sourceBuffer = await getReadableDocumentSourceBufferForOwner(doc.name, authCtx);
        const body = new Uint8Array(sourceBuffer);
        return new NextResponse(body, {
            headers: {
                'Content-Type': doc.mimeType || 'application/octet-stream',
                'Content-Length': String(body.byteLength),
                'Cache-Control': 'private, no-store',
                'X-Content-Type-Options': 'nosniff',
            },
        });
    } catch (e) {
        const status = e instanceof GuardError ? e.status : 503;
        const message = e instanceof GuardError ? e.message : DOCUMENT_SOURCE_RETRY_MESSAGE;
        return NextResponse.json({ error: message }, { status });
    }
}
