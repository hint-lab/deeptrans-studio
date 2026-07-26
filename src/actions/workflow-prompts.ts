'use server';

import { requireUser } from '@/lib/guards';
import {
    isWorkflowPromptKey,
    parseWorkflowPromptSaveInput,
    type WorkflowPromptKey,
} from '@/lib/workflow-prompt-keys';
import { prisma } from '@/lib/db';
import { listWorkflowPromptSettings } from '@/server/workflow-prompts';

function requirePromptKey(value: unknown): WorkflowPromptKey {
    if (!isWorkflowPromptKey(value)) throw new Error('Prompt 配置无效');
    return value;
}

export async function listWorkflowPromptSettingsAction(locale?: string) {
    const authCtx = await requireUser();
    return listWorkflowPromptSettings(authCtx, locale);
}

export async function saveWorkflowPromptAction(input: {
    nodeKey: string;
    content: string;
    enabled: boolean;
}) {
    const authCtx = await requireUser();
    const parsed = parseWorkflowPromptSaveInput(input);
    if (!parsed.ok) throw new Error('Prompt 配置无效');
    const { nodeKey, content, enabled } = parsed.value;
    if (!content) {
        await prisma.userWorkflowPrompt.deleteMany({
            where: { userId: authCtx.userId, nodeKey },
        });
        return { nodeKey, content: '', enabled: true, version: 0, customized: false };
    }

    const row = await prisma.userWorkflowPrompt.upsert({
        where: { userId_nodeKey: { userId: authCtx.userId, nodeKey } },
        create: { userId: authCtx.userId, nodeKey, content, enabled },
        update: { content, enabled, version: { increment: 1 } },
        select: { nodeKey: true, content: true, enabled: true, version: true },
    });
    return { ...row, customized: true };
}

export async function resetWorkflowPromptAction(nodeKeyInput: string) {
    const authCtx = await requireUser();
    const nodeKey = requirePromptKey(nodeKeyInput);
    await prisma.userWorkflowPrompt.deleteMany({
        where: { userId: authCtx.userId, nodeKey },
    });
    return { nodeKey, content: '', enabled: true, version: 0, customized: false };
}
