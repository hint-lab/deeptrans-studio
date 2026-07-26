export const WORKFLOW_PROMPT_KEYS = [
    'document-segmentation',
    'mono-term-extract',
    'term-embed-trans',
    'syntax-evaluate',
    'syntax-advice-embed',
    'discourse-evaluate',
    'discourse-embed',
] as const;

export type WorkflowPromptKey = (typeof WORKFLOW_PROMPT_KEYS)[number];

export const WORKFLOW_PROMPT_MAX_LENGTH = 4000;

export function isWorkflowPromptKey(value: unknown): value is WorkflowPromptKey {
    return WORKFLOW_PROMPT_KEYS.includes(value as WorkflowPromptKey);
}

export function normalizeWorkflowPrompt(value: unknown): string {
    return typeof value === 'string' ? value.trim().slice(0, WORKFLOW_PROMPT_MAX_LENGTH) : '';
}

export type WorkflowPromptSaveInput = {
    nodeKey: WorkflowPromptKey;
    content: string;
    enabled: boolean;
};

export type WorkflowPromptSaveInputResult =
    | { ok: true; value: WorkflowPromptSaveInput }
    | {
          ok: false;
          error: 'INVALID_NODE' | 'INVALID_CONTENT' | 'CONTENT_TOO_LONG' | 'INVALID_ENABLED';
      };

/**
 * Server Actions are callable over the network, so TypeScript's client-side
 * signature cannot be treated as validation. Reject malformed input rather
 * than coercing it into a reset or letting Prisma surface an implementation
 * error to the UI.
 */
export function parseWorkflowPromptSaveInput(value: unknown): WorkflowPromptSaveInputResult {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { ok: false, error: 'INVALID_CONTENT' };
    }

    const input = value as Record<string, unknown>;
    if (!isWorkflowPromptKey(input.nodeKey)) return { ok: false, error: 'INVALID_NODE' };
    if (typeof input.content !== 'string') return { ok: false, error: 'INVALID_CONTENT' };
    if (input.content.length > WORKFLOW_PROMPT_MAX_LENGTH) {
        return { ok: false, error: 'CONTENT_TOO_LONG' };
    }
    if (typeof input.enabled !== 'boolean') return { ok: false, error: 'INVALID_ENABLED' };

    return {
        ok: true,
        value: {
            nodeKey: input.nodeKey,
            content: normalizeWorkflowPrompt(input.content),
            enabled: input.enabled,
        },
    };
}

export function mergePromptInstructions(...values: unknown[]): string | undefined {
    const instructions = values.map(normalizeWorkflowPrompt).filter(Boolean);
    return instructions.length ? instructions.join('\n\n') : undefined;
}

/**
 * A workflow prompt is an account setting, not a client-controlled execution
 * option. Keep ordinary, non-prompt options (locale, language, domain, etc.)
 * while making it impossible for a legacy Server Action to forward a raw
 * client `prompt` value to an agent by accident.
 */
export function omitClientWorkflowPrompt<T extends object>(
    options: T | undefined
): Omit<T, 'prompt'> {
    const { prompt: _ignoredPrompt, ...safeOptions } = (options || {}) as T & {
        prompt?: unknown;
    };
    return safeOptions as Omit<T, 'prompt'>;
}

export const WORKFLOW_STAGE_PROMPT_KEYS: Record<string, WorkflowPromptKey[]> = {
    SEGMENT: ['document-segmentation'],
    MT: ['mono-term-extract', 'term-embed-trans'],
    QA: ['syntax-evaluate', 'syntax-advice-embed'],
    POST_EDIT: ['discourse-evaluate', 'discourse-embed'],
};
