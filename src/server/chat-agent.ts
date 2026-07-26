import { DiscourseEvaluateAgent } from '@/agents/postedit/DiscourseEvaluateAgent';
import { DiscourseQueryAgent } from '@/agents/postedit/DiscourseQueryAgent';
import {
    buildChatAgentConversationInstruction,
    buildEditorContextPrompt,
    isChatAgentKey,
    resolveEditorWorkingText,
    resolveChatAgentQuery,
    type ChatAgentKey,
} from '@/lib/chat-context';
import {
    formatMemorySearchDisplaySignal,
    memorySearchPublicErrorMessage,
} from '@/lib/memory-search';
import {
    GuardError,
    requireOwnedDocumentItem,
    requireOwnedProject,
    type AuthContext,
} from '@/lib/guards';
import type { SyntaxQualityResult } from '@/lib/syntax-quality';
import { resolveAuthorizedProjectMemoryScope, searchMemoryForOwner } from '@/server/memory';
import {
    baselineTranslate,
    extractMonolingualTerms,
    lookupDictionaryForOwner,
} from '@/server/pre-translate';
import { queryDictionaryEntriesWithOwner } from '@/server/dictionary';
import { evaluateSyntax } from '@/server/quality-assure';
import { resolveWorkflowPrompt } from '@/server/workflow-prompts';
import type { DictEntry } from '@/types/terms';

const MAX_AGENT_RESPONSE_CHARS = 20_000;

type AgentRequestContext = {
    projectId?: unknown;
    documentItemId?: unknown;
    sourceText?: unknown;
    targetText?: unknown;
};

export type ChatAgentRequest = {
    agentKey: unknown;
    prompt?: unknown;
    locale?: unknown;
    history?: unknown;
    context?: unknown;
};

type ChatAgentWorkspace = {
    projectId?: string;
    projectName?: string;
    documentName?: string;
    itemOrder?: number;
    status?: string;
    sourceLanguage?: string;
    targetLanguage?: string;
    sourceText: string;
    targetText: string;
};

function record(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}

function shortString(value: unknown, maxLength = 200): string {
    return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function localeOf(value: unknown): 'zh' | 'en' {
    return value === 'en' ? 'en' : 'zh';
}

function message(locale: 'zh' | 'en', zh: string, en: string) {
    return locale === 'en' ? en : zh;
}

function clipResult(value: string) {
    const text = String(value || '').trim();
    return text.length <= MAX_AGENT_RESPONSE_CHARS
        ? text
        : `${text.slice(0, MAX_AGENT_RESPONSE_CHARS)}\n…`;
}

function stringify(value: unknown) {
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value || '');
    }
}

function formatDictionaryEntries(entries: DictEntry[], locale: 'zh' | 'en') {
    if (!entries.length) {
        return message(
            locale,
            '未找到匹配的词典条目。',
            'No matching dictionary entries were found.'
        );
    }

    const title = locale === 'zh' ? '词典查询结果' : 'Dictionary results';
    return `## ${title}\n\n${entries
        .slice(0, 5)
        .map((entry, index) => {
            const notes = entry.notes
                ? `\n   - ${locale === 'zh' ? '备注' : 'Notes'}：${entry.notes}`
                : '';
            const source = entry.source
                ? `\n   - ${locale === 'zh' ? '词库' : 'Dictionary'}：${entry.source}`
                : '';
            return `${index + 1}. **${entry.term}** → ${entry.translation}${notes}${source}`;
        })
        .join('\n')}`;
}

function formatSyntaxResult(result: SyntaxQualityResult, locale: 'zh' | 'en') {
    const title = locale === 'zh' ? '句法检查结果' : 'Syntax review results';
    const review =
        result.reviewStatus === 'pass'
            ? message(locale, '通过', 'Pass')
            : result.reviewStatus === 'needs_review'
              ? message(locale, '需要复核', 'Needs review')
              : message(locale, '待确认', 'Unknown');
    const summary =
        locale === 'zh'
            ? `复核状态：**${review}**；严重 ${result.summary.critical}，主要 ${result.summary.major}，轻微 ${result.summary.minor}。`
            : `Review status: **${review}**; critical ${result.summary.critical}, major ${result.summary.major}, minor ${result.summary.minor}.`;
    const issues = result.issues.slice(0, 8);
    const details = issues.length
        ? issues
              .map(
                  (issue, index) =>
                      `${index + 1}. **${issue.severity || 'major'} · ${issue.category}**：${issue.message}${issue.advice ? `\n   - ${locale === 'zh' ? '建议' : 'Advice'}：${issue.advice}` : ''}`
              )
              .join('\n')
        : message(
              locale,
              '未发现需要单独处理的句法问题。',
              'No standalone syntax issues were found.'
          );

    return `## ${title}\n\n${summary}\n\n${details}`;
}

function formatDiscourseResult(
    references: Array<{
        source: string;
        target: string;
        score?: number;
        vectorScore?: number;
        keywordScore?: number;
        searchMode?: string;
    }>,
    evaluation: unknown,
    locale: 'zh' | 'en'
) {
    const title = locale === 'zh' ? '语篇检查结果' : 'Discourse review results';
    const refsTitle = locale === 'zh' ? '参考语段' : 'Reference segments';
    const evaluationTitle = locale === 'zh' ? '评估结果' : 'Evaluation';
    const refs = references.length
        ? references
              .slice(0, 5)
              .map(
                  (hit, index) =>
                      `${index + 1}. ${formatMemorySearchDisplaySignal(hit, locale)}\n   - ${hit.source}\n   - ${hit.target}`
              )
              .join('\n')
        : message(locale, '未找到可用的参考语段。', 'No usable reference segments were found.');

    return `## ${title}\n\n### ${refsTitle}\n\n${refs}\n\n### ${evaluationTitle}\n\n\`\`\`json\n${stringify(evaluation)}\n\`\`\``;
}

function agentInstruction(
    prompt: unknown,
    history: unknown,
    workspace: ChatAgentWorkspace,
    locale: 'zh' | 'en'
) {
    const conversation = buildChatAgentConversationInstruction(prompt, history, locale);
    const workspaceContext = buildEditorContextPrompt(
        {
            projectId: workspace.projectId,
            projectName: workspace.projectName,
            documentName: workspace.documentName,
            itemOrder: workspace.itemOrder,
            status: workspace.status,
            sourceLanguage: workspace.sourceLanguage,
            targetLanguage: workspace.targetLanguage,
        },
        locale
    );
    // The durable transcript is reference material; place the current
    // instruction after workspace metadata so an older turn cannot become the
    // last apparent preference for a fixed-purpose agent.
    return [workspaceContext, conversation].filter(Boolean).join('\n\n');
}

async function resolveWorkspace(
    contextValue: unknown,
    authCtx: AuthContext
): Promise<ChatAgentWorkspace> {
    const context = (record(contextValue) || {}) as AgentRequestContext;
    const documentItemId = shortString(context.documentItemId);
    const requestedProjectId = shortString(context.projectId);

    if (documentItemId) {
        const item = await requireOwnedDocumentItem(documentItemId, authCtx);
        if (requestedProjectId && requestedProjectId !== item.document.projectId) {
            throw new GuardError(404, '当前语段不属于请求中的项目');
        }
        const project = await requireOwnedProject(item.document.projectId, authCtx);
        return {
            projectId: project.id,
            projectName: project.name,
            documentName: item.document.originalName || item.document.name,
            itemOrder: item.order,
            status: String(item.status),
            sourceLanguage: project.sourceLanguage,
            targetLanguage: project.targetLanguage,
            // A draft is allowed only after the owning segment is resolved. It
            // is bounded and used as untrusted working material; no draft is
            // persisted or used to bypass project/item authorization.
            sourceText: resolveEditorWorkingText(item.sourceText, context.sourceText),
            targetText: resolveEditorWorkingText(item.targetText, context.targetText),
        };
    }

    if (requestedProjectId) {
        const project = await requireOwnedProject(requestedProjectId, authCtx);
        return {
            projectId: project.id,
            projectName: project.name,
            sourceLanguage: project.sourceLanguage,
            targetLanguage: project.targetLanguage,
            sourceText: '',
            targetText: '',
        };
    }

    return { sourceText: '', targetText: '' };
}

function requireSource(workspace: ChatAgentWorkspace, locale: 'zh' | 'en') {
    if (workspace.sourceText) return workspace.sourceText;
    throw new GuardError(
        400,
        message(
            locale,
            '请先在编辑器中选择一个包含原文的语段。',
            'Select an editor segment with source text first.'
        )
    );
}

function requireTarget(workspace: ChatAgentWorkspace, locale: 'zh' | 'en') {
    if (workspace.targetText) return workspace.targetText;
    throw new GuardError(
        400,
        message(
            locale,
            '当前语段还没有译文，暂时不能执行此检查。',
            'The current segment has no translation to review yet.'
        )
    );
}

async function resolveAgentPrompt(
    authCtx: AuthContext,
    nodeKey: 'term-embed-trans' | 'mono-term-extract' | 'syntax-evaluate' | 'discourse-evaluate',
    instruction: string
) {
    const savedPrompt = await resolveWorkflowPrompt(authCtx, nodeKey);
    return [savedPrompt, instruction].filter(Boolean).join('\n\n') || undefined;
}

async function queryDictionaryForOwner(
    query: string,
    authCtx: AuthContext,
    projectId?: string
): Promise<DictEntry[]> {
    const result = await queryDictionaryEntriesWithOwner(query, authCtx, {
        limit: 5,
        projectId,
    });
    if (!result.success) throw new Error('词典查询失败');
    return (result.data || []).map(row => ({
        term: row.term,
        translation: row.translation,
        notes: row.notes,
        source: row.source,
        dictionaryId: row.dictionaryId,
        id: row.id,
    }));
}

type ProjectMemoryScope = {
    hasBindings: boolean;
    memoryIds: string[];
};

type ProjectMemoryScopeResolver = (
    projectId: string,
    owner: AuthContext
) => Promise<ProjectMemoryScope>;

/**
 * Keep project-memory binding failures in the same safe public vocabulary as
 * retrieval itself. Guard failures retain their explicit HTTP semantics, but
 * Prisma/provider details must never reach the chat stream.
 */
export async function resolveChatProjectMemoryIds(
    projectId: string | undefined,
    authCtx: AuthContext,
    resolveScope: ProjectMemoryScopeResolver = resolveAuthorizedProjectMemoryScope
) {
    if (!projectId) return undefined;

    try {
        const scope = await resolveScope(projectId, authCtx);
        return scope.hasBindings ? scope.memoryIds : undefined;
    } catch (error) {
        if (error instanceof GuardError) throw error;
        throw new Error(memorySearchPublicErrorMessage(error));
    }
}

/**
 * Runs a selected IDE chat agent against an authenticated, persisted editor
 * segment. It returns presentation text only; callers must not persist or
 * auto-apply the result.
 */
export async function runChatAgentForOwner(input: ChatAgentRequest, authCtx: AuthContext) {
    if (!isChatAgentKey(input.agentKey)) {
        throw new GuardError(400, '不支持的智能体类型');
    }

    const agentKey: ChatAgentKey = input.agentKey;
    const locale = localeOf(input.locale);
    const workspace = await resolveWorkspace(input.context, authCtx);
    const instruction = agentInstruction(input.prompt, input.history, workspace, locale);

    switch (agentKey) {
        case 'basicTranslation': {
            const sourceText = requireSource(workspace, locale);
            const prompt = await resolveAgentPrompt(authCtx, 'term-embed-trans', instruction);
            return clipResult(
                await baselineTranslate(
                    sourceText,
                    workspace.sourceLanguage,
                    workspace.targetLanguage,
                    {
                        prompt,
                    }
                )
            );
        }

        case 'termCheck': {
            const sourceText = requireSource(workspace, locale);
            const prompt = await resolveAgentPrompt(authCtx, 'mono-term-extract', instruction);
            const terms = await extractMonolingualTerms(sourceText, { prompt, locale });
            const entries = await lookupDictionaryForOwner(terms, authCtx, {
                projectId: workspace.projectId,
            });
            const title = locale === 'zh' ? '术语检查结果' : 'Terminology check results';
            const termLabel = locale === 'zh' ? '候选术语' : 'Candidate terms';
            const noTerms =
                locale === 'zh' ? '未识别出候选术语。' : 'No candidate terms were identified.';
            const termList = terms.length
                ? terms
                      .slice(0, 12)
                      .map((term, index) => `${index + 1}. ${term.term}`)
                      .join('\n')
                : noTerms;
            return clipResult(
                `## ${title}\n\n### ${termLabel}\n\n${termList}\n\n${formatDictionaryEntries(entries, locale)}`
            );
        }

        case 'syntaxCheck': {
            const sourceText = requireSource(workspace, locale);
            const targetText = requireTarget(workspace, locale);
            const prompt = await resolveAgentPrompt(authCtx, 'syntax-evaluate', instruction);
            const result = await evaluateSyntax(sourceText, targetText, {
                targetLanguage: workspace.targetLanguage,
                prompt,
                locale,
            });
            return clipResult(formatSyntaxResult(result, locale));
        }

        case 'discourseCheck': {
            const sourceText = requireSource(workspace, locale);
            const targetText = requireTarget(workspace, locale);
            const prompt = await resolveAgentPrompt(authCtx, 'discourse-evaluate', instruction);
            const memoryIds = await resolveChatProjectMemoryIds(workspace.projectId, authCtx);
            const references = await new DiscourseQueryAgent(locale).execute(
                { source: sourceText, owner: authCtx, memoryIds },
                { locale }
            );
            const evaluation = await new DiscourseEvaluateAgent(locale).execute(
                {
                    source: sourceText,
                    target: targetText,
                    references: references.hits,
                    prompt,
                    locale,
                },
                { locale }
            );
            return clipResult(formatDiscourseResult(references.hits, evaluation, locale));
        }

        case 'dictionaryQuery': {
            const query = resolveChatAgentQuery(input.prompt, workspace.sourceText);
            if (!query) {
                throw new GuardError(
                    400,
                    message(
                        locale,
                        '请输入查询词，或先选择一个原文语段。',
                        'Enter a query or select a source segment first.'
                    )
                );
            }
            return clipResult(
                formatDictionaryEntries(
                    await queryDictionaryForOwner(query, authCtx, workspace.projectId),
                    locale
                )
            );
        }

        case 'memoryQuery': {
            const query = resolveChatAgentQuery(input.prompt, workspace.sourceText);
            if (!query) {
                throw new GuardError(
                    400,
                    message(
                        locale,
                        '请输入查询词，或先选择一个原文语段。',
                        'Enter a query or select a source segment first.'
                    )
                );
            }
            const memoryIds = await resolveChatProjectMemoryIds(workspace.projectId, authCtx);
            const result = await searchMemoryForOwner(query, authCtx, { limit: 5, memoryIds });
            if (!result.success) {
                throw new Error(
                    result.error ||
                        message(locale, '记忆库查询失败。', 'Translation memory lookup failed.')
                );
            }
            const rows = (Array.isArray(result.data) ? result.data : []) as Array<{
                source: string;
                target: string;
                score?: number;
                vectorScore?: number;
                keywordScore?: number;
                searchMode?: string;
            }>;
            if (!rows.length) {
                return message(
                    locale,
                    '未找到匹配的记忆库条目。',
                    'No matching translation-memory entries were found.'
                );
            }
            const title = locale === 'zh' ? '记忆库查询结果' : 'Translation memory results';
            return clipResult(
                `## ${title}\n\n${rows
                    .slice(0, 5)
                    .map(
                        (item, index) =>
                            `${index + 1}. ${formatMemorySearchDisplaySignal(item, locale)}\n   - **${item.source}**\n   - ${item.target}`
                    )
                    .join('\n')}`
            );
        }
    }
}
