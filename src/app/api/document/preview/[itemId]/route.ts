import { NextRequest, NextResponse } from 'next/server';
import { findDocumentItemWithDocumentByIdDB } from '@/db/documentItem';

export async function GET(req: NextRequest, context: any) {
    try {
        const { itemId } = (await context?.params) || {};
        if (!itemId) return NextResponse.json({ error: 'Missing itemId' }, { status: 400 });
        const item = await findDocumentItemWithDocumentByIdDB(itemId);
        if (!item || !item.document)
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        const doc: any = item.document;
        let url: string | null = doc.url || null;
        if (!url) return NextResponse.json({ error: 'No preview url' }, { status: 404 });

        // Normalize to absolute and avoid localhost in client context
        const reqOrigin = req.nextUrl.origin;

        try {
            const parsed = new URL(url, reqOrigin);
            // If points to localhost, rewrite to current origin with same path
            const isLocal = ['localhost', '127.0.0.1'].includes(parsed.hostname);
            const base = process.env.NEXT_PUBLIC_BASE_URL || reqOrigin;
            const out = new URL(
                parsed.pathname + parsed.search + parsed.hash,
                isLocal ? base : parsed.origin
            );
            return NextResponse.redirect(out.toString(), 302);
        } catch {
            // Fallback: treat as relative path
            const base = process.env.NEXT_PUBLIC_BASE_URL || reqOrigin;
            const out = new URL(url.startsWith('/') ? url : `/${url}`, base);
            return NextResponse.redirect(out.toString(), 302);
        }
    } catch (e) {
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
