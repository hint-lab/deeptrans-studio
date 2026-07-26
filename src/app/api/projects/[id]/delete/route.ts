import {
    buildProjectDictionaryCleanupPlan,
    projectDictionaryForCleanupFromBinding,
    type ProjectDictionaryCleanupBinding,
} from '@/lib/project-dictionary-cleanup';
import { prisma } from '@/lib/db';
import { guardMessage, guardStatus, requireUser, requireWritableProject } from '@/lib/guards';
import { createLogger } from '@/lib/logger';
import { Prisma } from '@prisma/client';
import { NextRequest } from 'next/server';

const logger = createLogger(
    {
        type: 'project:delete',
    },
    {
        json: false,
        pretty: false,
        colors: true,
        includeCaller: false,
    }
);

type DeleteProjectRequest = {
    /** Preferred explicit option. */
    deleteEligibleDictionaries?: boolean;
    /** Backwards compatible alias for existing clients. */
    deleteDictionaries?: boolean;
};

async function getDeleteEligibleDictionaries(req: NextRequest) {
    const body = (await req.json().catch(() => null)) as DeleteProjectRequest | null;

    // An omitted or malformed request must preserve dictionaries by default.
    if (typeof body?.deleteEligibleDictionaries === 'boolean') {
        return body.deleteEligibleDictionaries;
    }
    return body?.deleteDictionaries === true;
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const { id: projectId } = await context.params;
        const deleteEligibleDictionaries = await getDeleteEligibleDictionaries(req);
        const authCtx = await requireUser();

        // Project deletion is an owner-only operation; tenant visibility alone is not enough.
        await requireWritableProject(projectId, authCtx);

        const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            // Repeat the owner predicate inside the transaction so the destructive query does
            // not rely solely on an authorization read from before the transaction began.
            const project = await tx.project.findFirst({
                where: { id: projectId, userId: authCtx.userId },
                include: {
                    projectDictionaries: {
                        include: {
                            dictionary: {
                                include: {
                                    projectBindings: {
                                        select: { projectId: true },
                                    },
                                    _count: {
                                        select: { entries: true },
                                    },
                                },
                            },
                        },
                    },
                },
            });

            if (!project) {
                throw new Error('项目不存在或无权写入');
            }

            const plan = buildProjectDictionaryCleanupPlan({
                projectId,
                ownerId: authCtx.userId,
                tenantId: project.tenantId,
                deleteEligibleDictionaries,
                dictionaries: (
                    project.projectDictionaries as ProjectDictionaryCleanupBinding[]
                ).map(projectDictionaryForCleanupFromBinding),
            });

            let deletedDictionaryCount = 0;
            for (const candidate of plan.dictionaries.filter(
                dictionary => dictionary.selectedForDeletion
            )) {
                // Recheck all destructive invariants in SQL. If a binding, owner, tenant,
                // visibility, or name changed after the preview, preserve the dictionary.
                const deleted = await tx.dictionary.deleteMany({
                    where: {
                        id: candidate.id,
                        name: candidate.name,
                        visibility: 'PROJECT',
                        userId: authCtx.userId,
                        tenantId: project.tenantId,
                        projectBindings: {
                            some: { projectId },
                            every: { projectId },
                        },
                    },
                });
                deletedDictionaryCount += deleted.count;
            }

            await tx.projectDictionary.deleteMany({ where: { projectId } });
            await tx.projectMemory.deleteMany({ where: { projectId } });
            await tx.project.delete({ where: { id: project.id } });

            const retainedDictionaryCount = plan.summary.totalBound - deletedDictionaryCount;

            return {
                success: true,
                message: '项目已删除',
                project: {
                    id: project.id,
                    deleted: true,
                },
                dictionaries: {
                    cleanupRequested: deleteEligibleDictionaries,
                    totalBound: plan.summary.totalBound,
                    eligibleForCleanup: plan.summary.eligibleForCleanup,
                    deleted: deletedDictionaryCount,
                    retained: retainedDictionaryCount,
                    retainedByChoice: deleteEligibleDictionaries
                        ? 0
                        : plan.summary.eligibleForCleanup,
                    retainedByPolicy: plan.summary.totalBound - plan.summary.eligibleForCleanup,
                    retainedAfterPreviewChange: deleteEligibleDictionaries
                        ? plan.summary.selectedForDeletion - deletedDictionaryCount
                        : 0,
                    statusCounts: plan.summary.statusCounts,
                },
            };
        });

        return Response.json(result);
    } catch (error) {
        logger.error('删除项目失败:', error);
        return Response.json(
            { error: guardMessage(error) || '删除失败' },
            { status: guardStatus(error) }
        );
    }
}
