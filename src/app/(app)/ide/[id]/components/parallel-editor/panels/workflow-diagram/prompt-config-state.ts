import {
    isWorkflowPromptKey,
    WORKFLOW_PROMPT_KEYS,
    type WorkflowPromptKey,
} from '@/lib/workflow-prompt-keys';

export type PromptConfigLoadState = 'loading' | 'ready' | 'error';

export type PromptConfigSettingPayload = {
    nodeKey: WorkflowPromptKey;
    title: string;
    description: string;
    systemPrompt: string;
    content: string;
    enabled: boolean;
    version: number;
    updatedAt: string | null;
    customized: boolean;
};

export type PromptConfigSheetState = 'no-selection' | 'loading' | 'error' | 'missing' | 'ready';

/**
 * Keep the sheet's recovery states explicit. In particular, a failed request
 * or a setting missing from an otherwise successful response must never look
 * like a request that is still in progress.
 */
export function getPromptConfigSheetState({
    selectedKey,
    hasSelectedSetting,
    loadState,
}: {
    selectedKey: string | null;
    hasSelectedSetting: boolean;
    loadState: PromptConfigLoadState;
}): PromptConfigSheetState {
    if (!selectedKey) return 'no-selection';
    if (loadState === 'loading') return 'loading';
    if (loadState === 'error') return 'error';
    return hasSelectedSetting ? 'ready' : 'missing';
}

/**
 * Server Actions are expected to return every editable node. Treat a malformed
 * or incomplete response as a load failure instead of letting the Sheet show a
 * misleading blank/missing configuration or crash while reading `.find()`.
 */
export function isPromptConfigSettingsPayload(
    value: unknown
): value is PromptConfigSettingPayload[] {
    if (!Array.isArray(value) || value.length !== WORKFLOW_PROMPT_KEYS.length) return false;

    const nodeKeys = new Set<WorkflowPromptKey>();
    for (const setting of value) {
        if (!setting || typeof setting !== 'object') return false;
        const candidate = setting as Record<string, unknown>;
        if (
            !isWorkflowPromptKey(candidate.nodeKey) ||
            typeof candidate.title !== 'string' ||
            typeof candidate.description !== 'string' ||
            typeof candidate.systemPrompt !== 'string' ||
            typeof candidate.content !== 'string' ||
            typeof candidate.enabled !== 'boolean' ||
            typeof candidate.version !== 'number' ||
            !Number.isInteger(candidate.version) ||
            candidate.version < 0 ||
            (candidate.updatedAt !== null && typeof candidate.updatedAt !== 'string') ||
            typeof candidate.customized !== 'boolean' ||
            nodeKeys.has(candidate.nodeKey)
        ) {
            return false;
        }
        nodeKeys.add(candidate.nodeKey);
    }

    return WORKFLOW_PROMPT_KEYS.every(nodeKey => nodeKeys.has(nodeKey));
}

/** A cancel/close affordance cannot abort an already submitted server write. */
export function canDismissPromptConfigSheet(saving: boolean) {
    return !saving;
}
