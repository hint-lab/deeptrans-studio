import { NextRequest, NextResponse } from 'next/server';
import { updateDocItemStatusAction } from '@/actions/document-item';
import { guardMessage, guardStatus, requireWritableDocumentItem } from '@/lib/guards';
import { getSnapshotlessWorkflowStatusRejection } from '@/lib/workflow-status-route-policy';

export async function POST(req: NextRequest, context: any) {
    try {
        const { id } = (await context?.params) || {};
        const body = await req.json().catch(() => ({}));
        const status = String(body?.status || '').toUpperCase();
        if (!id || !status)
            return NextResponse.json({ success: false, error: 'missing params' }, { status: 400 });
        await requireWritableDocumentItem(id);
        // This route has no visible-editor draft or source/target snapshots.
        // Allowing it to sign off would therefore bypass the atomic review
        // save and could approve an older persisted translation.
        const protectedTransition = getSnapshotlessWorkflowStatusRejection(status);
        if (protectedTransition) {
            return NextResponse.json(
                {
                    success: false,
                    error: protectedTransition.error,
                },
                { status: protectedTransition.status }
            );
        }
        // Keep this API route on the same guarded transition path as the IDE
        // Server Action; otherwise it would remain a bypass for stage skips.
        const item = await updateDocItemStatusAction(id, status);
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
