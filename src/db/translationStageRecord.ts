import { prisma } from "@/lib/db";
import { TranslationProcessActorType , TranslationProcessStepStatus, TranslationStage, type TranslationStageRecord } from "@prisma/client";

export type TranslationStageRecordCreateInput = { 
    documentItemId?: string | null;
    stepKey: TranslationStage | keyof typeof TranslationStage | string;
    actorType?: TranslationProcessActorType | keyof typeof TranslationProcessActorType | string;
    actorId?: string | null;
    model?: string | null;
    status?: TranslationProcessStepStatus | keyof typeof TranslationProcessStepStatus | string | null;
    metadata?: any;
};

export const createTranslationStageRecordDB = async (params: TranslationStageRecordCreateInput): Promise<TranslationStageRecord> => {
    const { documentItemId, stepKey, actorType = TranslationProcessActorType.AGENT, actorId, model, status = TranslationProcessStepStatus.SUCCESS, metadata } = params;
    return prisma.translationStageRecord.create({
        data: {
            documentItemId: documentItemId ?? null,
            stepKey: stepKey as TranslationStage,
            actorType: actorType as TranslationProcessActorType,
            actorId: actorId ?? null,
            model: model ?? null,
            status: (status as TranslationProcessStepStatus) ?? TranslationProcessStepStatus.SUCCESS,
            metadata: metadata ?? null,
        },
    });
}

export const deleteTranslationStageRecordByIdDB = async (id: string): Promise<TranslationStageRecord> => {
    return prisma.translationStageRecord.delete({ where: { id } });
}

export const updateTranslationStageRecordFinishByIdDB = async (
    id: string, 
    status: TranslationProcessStepStatus = TranslationProcessStepStatus.SUCCESS, 
    metadata?: any
): Promise<TranslationStageRecord> => {
    return prisma.translationStageRecord.update({ where: { id }, data: { status, finishedAt: new Date(), metadata } });
}

export const findTranslationStageRecordsByDocumentItemIdDB = async (documentItemId: string, orderBy: { createdAt: "asc" | "desc" } = { createdAt: "asc" }): Promise<TranslationStageRecord[]> => {
    return prisma.translationStageRecord.findMany({ where: { documentItemId }, orderBy });
}

