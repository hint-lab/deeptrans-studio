'use server';

import { actionableActionError } from '@/lib/actionable-action-error';
import { publicActionErrorMessage, rethrowPublicActionError } from '@/lib/action-error-boundary';
import {
    createTranslationStageRecordDB,
    findTranslationStageRecordsByDocumentItemIdDB,
} from '@/db/translationStageRecord';
import { requireOwnedDocumentItem, requireUser, requireWritableDocumentItem } from '@/lib/guards';
import { createLogger } from '@/lib/logger';
import { workflowPromptVersionMetadata } from '@/server/workflow-prompts';
import {
    TranslationProcessActorType,
    TranslationProcessStepStatus,
    TranslationStage,
} from '@prisma/client';
import type { AuthContext } from '@/lib/guards';
import type { TranslationStageRecordCreateInput } from '@/db/translationStageRecord';

const logger = createLogger(
    {
        type: 'actions:translation-process-event',
    },
    {
        json: false,
        pretty: false,
        colors: true,
        includeCaller: false,
    }
);

const TRANSLATION_PROCESS_EVENT_UNAVAILABLE_MESSAGE = '流程记录暂不可用，请稍后重试';

type TranslationProcessActorInput = TranslationProcessActorType | 'HUMAN';

export type TranslationStageRollbackOptions = {
    /** The persisted stage before the rollback; defaults to the destination for legacy callers. */
    fromStage?: string;
};

type RollbackEventDeps = {
    requireUser: () => Promise<AuthContext>;
    requireWritableDocumentItem: (documentItemId: string, authCtx: AuthContext) => Promise<unknown>;
    createTranslationStageRecord: (input: TranslationStageRecordCreateInput) => Promise<unknown>;
};

function normalizeActorType(actorType?: string): TranslationProcessActorType {
    const normalized = String(actorType || TranslationProcessActorType.USER).toUpperCase();
    if (normalized === 'HUMAN') return TranslationProcessActorType.USER;
    if (normalized === TranslationProcessActorType.AGENT) return TranslationProcessActorType.AGENT;
    if (normalized === TranslationProcessActorType.USER) return TranslationProcessActorType.USER;
    throw actionableActionError('无效的流程执行者类型');
}

function normalizeStepStatus(status?: string): TranslationProcessStepStatus {
    const normalized = String(status || TranslationProcessStepStatus.SUCCESS).toUpperCase();
    if (normalized === TranslationProcessStepStatus.STARTED)
        return TranslationProcessStepStatus.STARTED;
    if (normalized === TranslationProcessStepStatus.SUCCESS)
        return TranslationProcessStepStatus.SUCCESS;
    if (normalized === TranslationProcessStepStatus.FAILED)
        return TranslationProcessStepStatus.FAILED;
    throw actionableActionError('无效的流程状态');
}

function normalizeStageStepKey(stepKey: string): TranslationStage {
    const normalized = String(stepKey || '')
        .trim()
        .toUpperCase();
    if (Object.values(TranslationStage).includes(normalized as TranslationStage)) {
        return normalized as TranslationStage;
    }
    throw actionableActionError('无效的翻译阶段');
}

export async function listTranslationProcessEventsForSignoff(documentItemId: string) {
    try {
        await requireOwnedDocumentItem(documentItemId);
        return await findTranslationStageRecordsByDocumentItemIdDB(documentItemId);
    } catch (error) {
        logger.error('读取翻译流程记录失败:', error);
        rethrowPublicActionError(error, TRANSLATION_PROCESS_EVENT_UNAVAILABLE_MESSAGE);
    }
}

export async function recordGoToNextTranslationProcessEventAction(
    documentItemId: string,
    stepKey: string,
    actorType?: TranslationProcessActorInput,
    status?: TranslationProcessStepStatus
) {
    try {
        const authCtx = await requireUser();
        await requireWritableDocumentItem(documentItemId, authCtx);
        // Legacy UI calls used HUMAN, while Prisma stores the canonical USER.
        // Normalize at the boundary so historical callers cannot silently lose
        // audit events to an enum validation error.
        const finalActorType = normalizeActorType(actorType);
        const finalStatus = normalizeStepStatus(status);
        const finalStepKey = normalizeStageStepKey(stepKey);
        const workflowPrompts =
            finalActorType === 'AGENT'
                ? await workflowPromptVersionMetadata(authCtx, finalStepKey)
                : [];
        await createTranslationStageRecordDB({
            documentItemId: documentItemId,
            stepKey: finalStepKey,
            actorType: finalActorType,
            actorId: finalActorType === TranslationProcessActorType.USER ? authCtx.userId : null,
            userId: authCtx.userId,
            model: finalActorType === TranslationProcessActorType.AGENT ? 'DeepTrans' : null,
            status: finalStatus,
            metadata: workflowPrompts.length ? { workflowPrompts } : undefined,
        });
        return {
            success: true,
            data: { id: documentItemId, stepKey: finalStepKey, actorType: finalActorType },
        } as const;
    } catch (error) {
        logger.error('记录翻译流程事件失败:', error);
        return {
            success: false,
            error: publicActionErrorMessage(error, TRANSLATION_PROCESS_EVENT_UNAVAILABLE_MESSAGE),
        } as const;
    }
}

/**
 * Record a rollback after its document-item status write has already
 * succeeded.  This deliberately returns a result instead of throwing so a
 * timeline outage cannot undo or misrepresent the completed rollback.
 *
 * The injectable dependencies keep the audit contract testable without a
 * session or database.
 */
export async function recordRollbackTranslationStageEventWithDeps(
    documentItemId: string,
    toStageInput: string,
    options: TranslationStageRollbackOptions = {},
    deps: RollbackEventDeps
) {
    try {
        const authCtx = await deps.requireUser();
        await deps.requireWritableDocumentItem(documentItemId, authCtx);
        const toStage = normalizeStageStepKey(toStageInput);
        const fromStage = options.fromStage ? normalizeStageStepKey(options.fromStage) : toStage;
        // A rollback is part of the audit trail. Deleting the whole history
        // erased the evidence needed to explain how a segment reached review.
        await deps.createTranslationStageRecord({
            documentItemId,
            stepKey: toStage,
            actorType: TranslationProcessActorType.USER,
            actorId: authCtx.userId,
            userId: authCtx.userId,
            status: TranslationProcessStepStatus.SUCCESS,
            metadata: { action: 'ROLLBACK', fromStage, toStage },
        });
        return {
            success: true,
            data: { id: documentItemId, stepKey: toStage, actorType: 'USER' as const },
        } as const;
    } catch (error) {
        logger.error('记录翻译流程回退事件失败:', error);
        return {
            success: false,
            error: publicActionErrorMessage(error, TRANSLATION_PROCESS_EVENT_UNAVAILABLE_MESSAGE),
        } as const;
    }
}

export async function recordGoToPreviousTranslationStageAction(
    documentItemId: string,
    toStageInput: string,
    options: TranslationStageRollbackOptions = {}
) {
    return recordRollbackTranslationStageEventWithDeps(documentItemId, toStageInput, options, {
        requireUser,
        requireWritableDocumentItem,
        createTranslationStageRecord: createTranslationStageRecordDB,
    });
}
