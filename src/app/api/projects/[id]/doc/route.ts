import { NextRequest, NextResponse } from 'next/server';
import { guardMessage, guardStatus, requireOwnedProject } from '@/lib/guards';

export async function GET(req: NextRequest, context: any) {
    try {
        const { id } = (await context?.params) || {};
        const project = await requireOwnedProject(id);
        const only = project.documents?.sort(
            (a: any, b: any) => Number(b.uploadedAt) - Number(a.uploadedAt)
        )?.[0];
        if (!only) return NextResponse.json({ error: 'not found' }, { status: 404 });
        return NextResponse.json({ documentId: (only as any).id });
    } catch (e: any) {
        return NextResponse.json({ error: guardMessage(e) }, { status: guardStatus(e) });
    }
}
