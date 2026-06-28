'use server';

import {
    createTranslationStageRecordDB,
    findTranslationStageRecordsByDocumentItemIdDB,
    deleteTranslationStageRecordsByDocumentItemIdDB,
} from '@/db/translationStageRecord';
import { requireOwnedDocumentItem, requireUser, requireWritableDocumentItem } from '@/lib/guards';

export async function listTranslationProcessEventsForSignoff(documentItemId: string) {
    await requireOwnedDocumentItem(documentItemId);
    return findTranslationStageRecordsByDocumentItemIdDB(documentItemId);
}

export async function recordGoToNextTranslationProcessEventAction(
    documentItemId: string,
    stepKey: string,
    actorType?: string,
    status?: string
) {
    try {
        const authCtx = await requireUser();
        await requireWritableDocumentItem(documentItemId, authCtx);
        const finalActorType = actorType || 'HUMAN';
        await createTranslationStageRecordDB({
            documentItemId: documentItemId,
            stepKey: stepKey,
            actorType: finalActorType as any,
            actorId:
                finalActorType === 'HUMAN' || finalActorType === 'USER'
                    ? authCtx.userId
                    : null,
            model: finalActorType === 'AGENT' ? 'DeepTrans' : null,
            status: status || ('SUCCESS' as any),
        });
        return {
            success: true,
            data: { id: documentItemId, stepKey: stepKey, actorType: finalActorType as any },
        } as const;
    } catch (e: any) {
        return { success: false, error: e?.message || String(e) } as const;
    }
}

export async function recordGoToPreviousTranslationStageAction(
    documentItemId: string,
    stepKey: string
) {
    try {
        await requireWritableDocumentItem(documentItemId);
        await deleteTranslationStageRecordsByDocumentItemIdDB(documentItemId);
        return {
            success: true,
            data: { id: documentItemId, stepKey: stepKey, actorType: 'USER' as any },
        } as const;
    } catch (e: any) {
        return { success: false, error: e?.message || String(e) } as const;
    }
}
