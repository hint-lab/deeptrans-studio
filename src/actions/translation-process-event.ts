"use server"

import { createTranslationStageRecordDB, findTranslationStageRecordsByDocumentItemIdDB, deleteTranslationStageRecordByIdDB } from "@/db/translationStageRecord"
import { auth } from "@/auth";

export async function listTranslationProcessEventsForSignoff(documentItemId: string) {
  return findTranslationStageRecordsByDocumentItemIdDB(documentItemId)
}

export async function recordGoToNextTranslationProcessEventAction(documentItemId: string, stepKey: string, actorType?: string, status?: string) {
  try {
    const session = await auth();
    const finalActorType = actorType || 'HUMAN';
    await createTranslationStageRecordDB({
      documentItemId: documentItemId,
      stepKey: stepKey,
      actorType: finalActorType as any,
      actorId: (finalActorType === 'HUMAN' || finalActorType === 'USER') ? session?.user?.id || '' : null,
      model: finalActorType === 'AGENT' ? 'DeepTrans' : null,
      status: status || 'SUCCESS' as any,
    })
    return { success: true, data: { id: documentItemId, stepKey: stepKey, actorType: finalActorType as any } } as const
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) } as const
  }
}


export async function recordGoToPreviousTranslationStageAction(documentItemId: string, stepKey: string) {
  try {
    await deleteTranslationStageRecordByIdDB(documentItemId)
    return { success: true, data: { id: documentItemId, stepKey: stepKey, actorType: 'USER' as any } } as const
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) } as const
  }
}
