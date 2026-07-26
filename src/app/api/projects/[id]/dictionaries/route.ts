import { prisma } from '@/lib/db';
import {
    buildProjectDictionaryCleanupPlan,
    projectDictionaryForCleanupFromBinding,
    type ProjectDictionaryCleanupBinding,
} from '@/lib/project-dictionary-cleanup';
import { guardMessage, guardStatus, requireUser, requireWritableProject } from '@/lib/guards';
import { createLogger } from '@/lib/logger';
import { NextRequest } from 'next/server';

const logger = createLogger(
    {
        type: 'request:project-dictionaries',
    },
    {
        json: false,
        pretty: false,
        colors: true,
        includeCaller: false,
    }
);

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const { id: projectId } = await context.params;
        const authCtx = await requireUser();

        // The cleanup preview is only available to the project owner, just like DELETE.
        const project = await requireWritableProject(projectId, authCtx);
        const projectDictionaries = await prisma.projectDictionary.findMany({
            where: { projectId },
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
        });

        const plan = buildProjectDictionaryCleanupPlan({
            projectId,
            ownerId: authCtx.userId,
            tenantId: project.tenantId,
            deleteEligibleDictionaries: true,
            dictionaries: (projectDictionaries as ProjectDictionaryCleanupBinding[]).map(
                projectDictionaryForCleanupFromBinding
            ),
        });

        return Response.json({
            dictionaries: plan.dictionaries,
            cleanup: {
                totalBound: plan.summary.totalBound,
                eligibleForCleanup: plan.summary.eligibleForCleanup,
                retainedWhenCleanupRuns: plan.summary.retained,
                statusCounts: plan.summary.statusCounts,
            },
        });
    } catch (error) {
        logger.error('获取项目词典失败:', error);
        return Response.json(
            { error: guardMessage(error) || '获取失败' },
            { status: guardStatus(error) }
        );
    }
}
