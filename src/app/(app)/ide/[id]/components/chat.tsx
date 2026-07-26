import { Button } from '@/components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDialog } from '@/hooks/useDialog';
import { useActiveDocumentItem } from '@/hooks/useActiveDocumentItem';
import { useExplorerTabs } from '@/hooks/useExplorerTabs';
import { useChatbarContent, useChatbarStream } from '@/hooks/useRightPanel';
import { useTranslationContent } from '@/hooks/useTranslation';
import { normalizeChatUserPrompt } from '@/lib/chat-context';
import { resolveChatClientErrorMessage } from '@/lib/ide-client-error';
import { chatStatus } from '@/lib/chat-status';
import {
    canOperateChatConversation,
    chatConversationScopeKeyFromIds,
    resolveChatConversationLoadState,
    resolveVisibleChatConversationScope,
} from '@/lib/chat-conversation-scope';
import { resolveUncommittedChatTurnReconciliation } from '@/lib/chat-turn-reconciliation';
import { CheckIcon, PaperPlaneIcon, TrashIcon } from '@radix-ui/react-icons';
import MarkdownPreview from '@uiw/react-markdown-preview';
import {
    BookOpenCheck,
    BookText,
    Database,
    Languages,
    Maximize2,
    MessageSquarePlus,
    Minimize2,
    Network,
    SpellCheck,
    UserRound,
    Wand,
    type LucideIcon,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import React from 'react';
import { cn } from 'src/lib/utils';
import { toast } from 'sonner';
// 这些将被翻译替换
const agentConfigs = [
    { key: 'basicTranslation', icon: Languages, tone: 'bg-sky-500/10 text-sky-600' },
    { key: 'termCheck', icon: BookText, tone: 'bg-amber-500/10 text-amber-600' },
    { key: 'syntaxCheck', icon: SpellCheck, tone: 'bg-violet-500/10 text-violet-600' },
    { key: 'discourseCheck', icon: Network, tone: 'bg-emerald-500/10 text-emerald-600' },
    { key: 'dictionaryQuery', icon: BookOpenCheck, tone: 'bg-orange-500/10 text-orange-600' },
    { key: 'memoryQuery', icon: Database, tone: 'bg-cyan-500/10 text-cyan-600' },
] as const;

type AgentConfig = (typeof agentConfigs)[number];

interface Agent {
    key: string;
    name: string;
    description: string;
    icon: LucideIcon;
    tone: string;
}

type ConversationOption = {
    id: string;
    createdAt?: string;
    updatedAt?: string;
};

function AgentGlyph({ agent, size = 'md' }: { agent: Agent; size?: 'sm' | 'md' }) {
    const Icon = agent.icon;
    return (
        <span
            aria-hidden="true"
            className={cn(
                'border-current/10 grid shrink-0 place-items-center rounded-[6px] border',
                agent.tone,
                size === 'sm'
                    ? 'h-4 w-4 [&_svg]:h-2.5 [&_svg]:w-2.5'
                    : 'h-6 w-6 [&_svg]:h-3.5 [&_svg]:w-3.5'
            )}
        >
            <Icon strokeWidth={1.9} />
        </span>
    );
}

// 检测是否包含markdown格式
const hasMarkdownFormat = (content: string): boolean => {
    const markdownPatterns = [
        /#{1,6}\s/, // 标题 # ## ###
        /\*\*.*\*\*/, // 粗体 **text**
        /\*.*\*/, // 斜体 *text*
        /`.*`/, // 行内代码 `code`
        /```[\s\S]*```/, // 代码块 ```code```
        /^\s*[-*+]\s/m, // 列表 - * +
        /^\s*\d+\.\s/m, // 数字列表 1. 2.
        /\[.*\]\(.*\)/, // 链接 [text](url)
        /!\[.*\]\(.*\)/, // 图片 ![alt](url)
        /^\s*>/m, // 引用 >
        /^\s*\|.*\|/m, // 表格 |col1|col2|
    ];

    return markdownPatterns.some(pattern => pattern.test(content));
};

export function CardsChat() {
    const t = useTranslations('IDE.chat');
    const locale = useLocale();
    const { isDialogOpen, toggleDialog } = useDialog();
    const [selectedAgents, setSelectedAgents] = React.useState<Agent[]>([]);
    const { chatbarContent, addMessage, removeMessage, resetContent, updateContent } =
        useChatbarContent();
    const { contentItemId, sourceText, targetText } = useTranslationContent();
    const { activeDocumentItem } = useActiveDocumentItem();
    const { explorerTabs } = useExplorerTabs();
    const params = useParams();
    const projectId = Array.isArray(params?.id) ? params.id[0] : params?.id;
    const activeConversationItemId = React.useMemo(() => {
        const itemId = String(activeDocumentItem?.id || '').trim();
        if (!itemId || explorerTabs.projectId !== projectId) return '';
        const belongsToProject = explorerTabs.documentTabs.some(document =>
            (document.items || []).some(item => String(item.id) === itemId)
        );
        return belongsToProject ? itemId : '';
    }, [activeDocumentItem?.id, explorerTabs.documentTabs, explorerTabs.projectId, projectId]);
    const conversationScope = resolveVisibleChatConversationScope({
        projectId,
        activeDocumentItemId: activeConversationItemId,
        loadedDocumentItemId: contentItemId,
    });
    const currentScopeKey = chatConversationScopeKeyFromIds(
        conversationScope.projectId,
        conversationScope.documentItemId
    );
    const currentScopeKeyRef = React.useRef(currentScopeKey);
    currentScopeKeyRef.current = currentScopeKey;
    const currentContext = React.useMemo(
        () => ({
            ...(conversationScope.projectId ? { projectId: conversationScope.projectId } : {}),
            ...(conversationScope.documentItemId
                ? { documentItemId: conversationScope.documentItemId }
                : {}),
        }),
        [conversationScope.documentItemId, conversationScope.projectId]
    );
    const [input, setInput] = React.useState('');
    const inputWasTruncatedRef = React.useRef(false);
    const [isInputExpanded, setIsInputExpanded] = React.useState(false);
    const inputRef = React.useRef<HTMLTextAreaElement>(null);
    const activeRequestRef = React.useRef<AbortController | null>(null);
    const requestVersionRef = React.useRef(0);
    const conversationLoadVersionRef = React.useRef(0);
    const conversationLoadAbortRef = React.useRef<AbortController | null>(null);
    const [loadedScopeKey, setLoadedScopeKey] = React.useState<string | null>(null);
    const [conversationId, setConversationId] = React.useState<string | null>(null);
    const conversationIdRef = React.useRef<string | null>(null);
    // A new conversation is a tab-local draft. Preserve the shared default
    // that was visible when it started so its late completion can only promote
    // itself if another tab has not selected a different thread meanwhile.
    const newConversationBaseIdRef = React.useRef<string | null>(null);
    const [conversationOptions, setConversationOptions] = React.useState<ConversationOption[]>([]);
    const [isConversationLoading, setIsConversationLoading] = React.useState(true);
    const [conversationLoadError, setConversationLoadError] = React.useState<{
        scopeKey: string;
        message: string;
    } | null>(null);
    const [conversationLoadAttempt, setConversationLoadAttempt] = React.useState(0);
    const [isConversationTransitioning, setIsConversationTransitioning] = React.useState(false);
    const [isChatSubmitting, setIsChatSubmitting] = React.useState(false);
    const [isNewConversationDraft, setIsNewConversationDraft] = React.useState(false);
    const { handleStreamResponse } = useChatbarStream();
    const isScopeReady = canOperateChatConversation({
        currentScopeKey,
        loadedScopeKey,
        isLoading: isConversationLoading,
        isTransitioning: isConversationTransitioning,
        isSubmitting: isChatSubmitting,
    });
    const visibleChatbarContent = loadedScopeKey === currentScopeKey ? chatbarContent : [];
    const normalizedInput = normalizeChatUserPrompt(input);
    const isChinese = locale.startsWith('zh');
    const chatMessages = React.useMemo(() => chatStatus(locale), [locale]);
    const conversationLoadState = resolveChatConversationLoadState({
        currentScopeKey,
        loadedScopeKey,
        isLoading: isConversationLoading,
        errorScopeKey: conversationLoadError?.scopeKey,
    });
    const visibleConversationLoadError =
        conversationLoadState === 'error' ? conversationLoadError?.message || null : null;
    const isConversationLoadPending = conversationLoadState === 'loading';
    const inputLimitNotice = isChinese
        ? '输入内容已截取为前 4,000 个字符。'
        : 'Your message was limited to the first 4,000 characters.';
    const threadLabel = isChinese ? '对话' : 'Conversation';
    const draftThreadLabel = isChinese ? '新对话（未发送）' : 'New conversation (not sent)';
    const scopeLabel = conversationScope.documentItemId
        ? isChinese
            ? '当前语段上下文'
            : 'Current segment context'
        : isChinese
          ? '项目上下文'
          : 'Project context';

    React.useEffect(() => {
        const element = inputRef.current;
        if (!element) return;
        element.style.height = 'auto';
        const minimumHeight = isInputExpanded ? 192 : 36;
        const maximumHeight = isInputExpanded ? 360 : 160;
        element.style.height = `${Math.min(
            Math.max(element.scrollHeight, minimumHeight),
            maximumHeight
        )}px`;
    }, [input, isInputExpanded]);

    const cancelActiveRequest = React.useCallback(() => {
        requestVersionRef.current += 1;
        activeRequestRef.current?.abort();
        activeRequestRef.current = null;
        setIsChatSubmitting(false);
    }, []);

    const cancelConversationLoad = React.useCallback(() => {
        conversationLoadAbortRef.current?.abort();
        conversationLoadAbortRef.current = null;
        conversationLoadVersionRef.current += 1;
    }, []);

    const beginActiveRequest = React.useCallback(() => {
        const controller = new AbortController();
        const version = ++requestVersionRef.current;
        activeRequestRef.current = controller;

        const isFresh = () =>
            requestVersionRef.current === version &&
            activeRequestRef.current === controller &&
            !controller.signal.aborted;
        const finish = () => {
            if (isFresh()) activeRequestRef.current = null;
        };

        return { signal: controller.signal, isFresh, finish };
    }, []);

    React.useEffect(
        () => () => {
            cancelActiveRequest();
            cancelConversationLoad();
        },
        [cancelActiveRequest, cancelConversationLoad]
    );

    const applyConversationPayload = React.useCallback(
        (payload: Record<string, unknown>, scopeKey: string) => {
            if (currentScopeKeyRef.current !== scopeKey) return false;
            const nextConversationId =
                typeof payload.conversationId === 'string' ? payload.conversationId : null;
            conversationIdRef.current = nextConversationId;
            setConversationId(nextConversationId);
            setConversationOptions(
                Array.isArray(payload.conversations)
                    ? payload.conversations
                          .filter((item: unknown): item is Record<string, unknown> => {
                              if (!item || typeof item !== 'object') return false;
                              return typeof (item as Record<string, unknown>).id === 'string';
                          })
                          .map(item => ({
                              id: String(item.id),
                              createdAt:
                                  typeof item.createdAt === 'string' ? item.createdAt : undefined,
                              updatedAt:
                                  typeof item.updatedAt === 'string' ? item.updatedAt : undefined,
                          }))
                    : []
            );
            const restored = Array.isArray(payload.messages)
                ? payload.messages
                      .filter((message: unknown): message is Record<string, unknown> => {
                          if (!message || typeof message !== 'object') return false;
                          const candidate = message as Record<string, unknown>;
                          return (
                              (candidate.role === 'user' || candidate.role === 'assistant') &&
                              typeof candidate.content === 'string'
                          );
                      })
                      .map(message => ({
                          id: typeof message.id === 'string' ? message.id : undefined,
                          role: String(message.role),
                          content: String(message.content),
                      }))
                : [];
            updateContent(restored);
            setLoadedScopeKey(scopeKey);
            return true;
        },
        [updateContent]
    );

    const reconcileUncommittedTurn = React.useCallback(
        async (input: {
            scopeKey: string;
            context: { projectId?: string; documentItemId?: string };
            isNewConversation: boolean;
            conversationId?: string;
            userMessageId: string;
            prompt: string;
            isRequestFresh: () => boolean;
            error: unknown;
        }) => {
            const decision = resolveUncommittedChatTurnReconciliation({
                requestScopeKey: input.scopeKey,
                currentScopeKey: currentScopeKeyRef.current,
                isRequestFresh: input.isRequestFresh(),
                isNewConversation: input.isNewConversation,
                conversationId: input.conversationId,
            });
            if (decision.kind === 'ignore') return;

            removeMessage(input.userMessageId);
            setInput(input.prompt);
            inputWasTruncatedRef.current = false;

            if (decision.kind === 'reset-new-draft') {
                // The failed draft never got a durable conversation id. Keep it
                // visibly blank rather than selecting an unrelated active thread.
                conversationIdRef.current = null;
                setConversationId(null);
                setIsNewConversationDraft(true);
                resetContent();
                return;
            }

            const message = resolveChatClientErrorMessage(
                input.error,
                locale,
                chatMessages.requestFailed
            );

            if (decision.kind === 'fail-closed') {
                resetContent();
                setLoadedScopeKey(null);
                setConversationLoadError({ scopeKey: input.scopeKey, message });
                toast.error(message);
                return;
            }

            cancelConversationLoad();
            const loadVersion = ++conversationLoadVersionRef.current;
            const controller = new AbortController();
            conversationLoadAbortRef.current = controller;
            setIsConversationTransitioning(true);
            setIsConversationLoading(true);
            setLoadedScopeKey(null);
            setConversationLoadError(null);
            resetContent();

            const query = new URLSearchParams();
            if (input.context.projectId) query.set('projectId', input.context.projectId);
            if (input.context.documentItemId) {
                query.set('documentItemId', input.context.documentItemId);
            }
            query.set('conversationId', decision.conversationId);
            query.set('locale', locale);

            try {
                const response = await fetch(`/api/chat?${query.toString()}`, {
                    signal: controller.signal,
                });
                const payload = (await response.json().catch(() => ({}))) as Record<
                    string,
                    unknown
                >;
                if (!response.ok) {
                    throw new Error(
                        resolveChatClientErrorMessage(
                            payload.error,
                            locale,
                            chatMessages.unavailable
                        )
                    );
                }
                if (
                    controller.signal.aborted ||
                    conversationLoadVersionRef.current !== loadVersion ||
                    currentScopeKeyRef.current !== input.scopeKey ||
                    !input.isRequestFresh()
                ) {
                    return;
                }
                if (applyConversationPayload(payload, input.scopeKey)) {
                    setIsNewConversationDraft(false);
                    setConversationLoadError(null);
                }
            } catch (reloadError) {
                if (
                    controller.signal.aborted ||
                    conversationLoadVersionRef.current !== loadVersion ||
                    currentScopeKeyRef.current !== input.scopeKey ||
                    !input.isRequestFresh()
                ) {
                    return;
                }
                const reloadMessage = resolveChatClientErrorMessage(
                    reloadError,
                    locale,
                    chatMessages.unavailable
                );
                setConversationLoadError({ scopeKey: input.scopeKey, message: reloadMessage });
                toast.error(reloadMessage);
            } finally {
                if (
                    conversationLoadVersionRef.current === loadVersion &&
                    !controller.signal.aborted &&
                    currentScopeKeyRef.current === input.scopeKey
                ) {
                    setIsConversationLoading(false);
                    setIsConversationTransitioning(false);
                    if (conversationLoadAbortRef.current === controller) {
                        conversationLoadAbortRef.current = null;
                    }
                }
            }
        },
        [
            applyConversationPayload,
            cancelConversationLoad,
            chatMessages,
            locale,
            removeMessage,
            resetContent,
        ]
    );

    React.useEffect(() => {
        const scopeKey = currentScopeKey;
        cancelActiveRequest();
        cancelConversationLoad();
        conversationIdRef.current = null;
        newConversationBaseIdRef.current = null;
        setConversationId(null);
        setLoadedScopeKey(null);
        setConversationOptions([]);
        setIsNewConversationDraft(false);
        setIsConversationTransitioning(false);
        resetContent();
        setSelectedAgents([]);
        setInput('');
        setConversationLoadError(null);
        const loadVersion = ++conversationLoadVersionRef.current;
        const controller = new AbortController();
        conversationLoadAbortRef.current = controller;
        setIsConversationLoading(true);

        const query = new URLSearchParams();
        if (conversationScope.projectId) query.set('projectId', conversationScope.projectId);
        if (conversationScope.documentItemId) {
            query.set('documentItemId', conversationScope.documentItemId);
        }
        query.set('locale', locale);

        void fetch(`/api/chat?${query.toString()}`, { signal: controller.signal })
            .then(async response => {
                const payload = (await response.json().catch(() => ({}))) as Record<
                    string,
                    unknown
                >;
                if (!response.ok) {
                    throw new Error(
                        resolveChatClientErrorMessage(
                            payload.error,
                            locale,
                            chatMessages.unavailable
                        )
                    );
                }
                if (
                    controller.signal.aborted ||
                    conversationLoadVersionRef.current !== loadVersion
                ) {
                    return;
                }
                if (applyConversationPayload(payload, scopeKey)) {
                    setConversationLoadError(null);
                }
            })
            .catch(error => {
                if (
                    controller.signal.aborted ||
                    conversationLoadVersionRef.current !== loadVersion
                ) {
                    return;
                }
                const message = resolveChatClientErrorMessage(
                    error,
                    locale,
                    chatMessages.unavailable
                );
                setConversationLoadError({ scopeKey, message });
                toast.error(message);
            })
            .finally(() => {
                if (
                    conversationLoadVersionRef.current === loadVersion &&
                    !controller.signal.aborted
                ) {
                    setIsConversationLoading(false);
                    if (conversationLoadAbortRef.current === controller) {
                        conversationLoadAbortRef.current = null;
                    }
                }
            });

        return () => {
            controller.abort();
            if (conversationLoadAbortRef.current === controller) {
                conversationLoadAbortRef.current = null;
            }
        };
    }, [
        applyConversationPayload,
        cancelActiveRequest,
        cancelConversationLoad,
        chatMessages,
        conversationLoadAttempt,
        conversationScope.documentItemId,
        conversationScope.projectId,
        currentScopeKey,
        locale,
        resetContent,
    ]);

    const retryConversationLoad = React.useCallback(() => {
        if (isConversationLoading) return;
        setConversationLoadAttempt(attempt => attempt + 1);
    }, [isConversationLoading]);

    const selectConversation = React.useCallback(
        async (nextConversationId: string) => {
            if (!nextConversationId || !isScopeReady || nextConversationId === conversationId)
                return;
            const scopeKey = currentScopeKey;
            setIsConversationTransitioning(true);
            try {
                const response = await fetch('/api/chat', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        conversationId: nextConversationId,
                        context: currentContext,
                        locale,
                    }),
                });
                const payload = (await response.json().catch(() => ({}))) as Record<
                    string,
                    unknown
                >;
                if (!response.ok) {
                    throw new Error(
                        resolveChatClientErrorMessage(
                            payload.error,
                            locale,
                            chatMessages.requestFailed
                        )
                    );
                }
                if (applyConversationPayload(payload, scopeKey)) setIsNewConversationDraft(false);
            } catch (error) {
                toast.error(
                    resolveChatClientErrorMessage(error, locale, chatMessages.requestFailed)
                );
            } finally {
                if (currentScopeKeyRef.current === scopeKey) setIsConversationTransitioning(false);
            }
        },
        [
            applyConversationPayload,
            chatMessages,
            conversationId,
            currentContext,
            currentScopeKey,
            isScopeReady,
            locale,
        ]
    );

    const clearConversation = React.useCallback(async () => {
        if (!isScopeReady || !conversationId) return;
        const scopeKey = currentScopeKey;
        setIsConversationTransitioning(true);
        try {
            const response = await fetch('/api/chat', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversationId, context: currentContext, locale }),
            });
            const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
            if (!response.ok) {
                throw new Error(
                    resolveChatClientErrorMessage(payload.error, locale, chatMessages.requestFailed)
                );
            }
            if (applyConversationPayload(payload, scopeKey)) {
                setInput('');
                inputWasTruncatedRef.current = false;
                setSelectedAgents([]);
                toast.success(t('clear'));
            }
        } catch (error) {
            toast.error(resolveChatClientErrorMessage(error, locale, chatMessages.requestFailed));
        } finally {
            if (currentScopeKeyRef.current === scopeKey) setIsConversationTransitioning(false);
        }
    }, [
        applyConversationPayload,
        chatMessages,
        conversationId,
        currentContext,
        currentScopeKey,
        isScopeReady,
        locale,
        t,
    ]);

    const startNewConversation = React.useCallback(() => {
        if (!isScopeReady) return;
        cancelActiveRequest();
        newConversationBaseIdRef.current = conversationIdRef.current;
        conversationIdRef.current = null;
        setConversationId(null);
        setIsNewConversationDraft(true);
        resetContent();
        setSelectedAgents([]);
        setInput('');
        toggleDialog();
    }, [cancelActiveRequest, isScopeReady, resetContent, toggleDialog]);

    const inputResizeLabel = isInputExpanded
        ? locale.startsWith('zh')
            ? '收起输入框'
            : 'Collapse input'
        : locale.startsWith('zh')
          ? '展开输入框'
          : 'Expand input';

    // 创建带翻译的agents数组
    const agents: Agent[] = React.useMemo(
        () =>
            agentConfigs.map(config => ({
                key: config.key,
                name: t(`agents.${config.key}`),
                description: t(`agents.${config.key}Desc`),
                icon: config.icon,
                tone: config.tone,
            })),
        [t]
    );
    const examples = React.useMemo(
        () => [t('examples.polish'), t('examples.translate'), t('examples.summarize')],
        [t]
    );

    return (
        <div className="flex size-full flex-col bg-background">
            {/* 头部 - 与IDE风格一致 */}
            <div className="flex h-9 items-center justify-between gap-2 border-b bg-muted/40 px-2 py-1.5 text-[11px] text-foreground/70">
                <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="font-medium">{t('title')}</span>
                    <Wand size="12" className="text-foreground/50" />
                    <span
                        aria-live="polite"
                        className={cn(
                            'hidden max-w-28 truncate rounded border px-1.5 py-0.5 text-[9px] sm:inline',
                            visibleConversationLoadError
                                ? 'border-destructive/30 bg-destructive/5 text-destructive'
                                : isConversationLoadPending
                                  ? 'border-amber-500/25 bg-amber-500/5 text-amber-700 dark:text-amber-300'
                                  : 'border-border/60 bg-background/70 text-muted-foreground'
                        )}
                        title={
                            visibleConversationLoadError
                                ? visibleConversationLoadError
                                : isConversationLoadPending
                                  ? isChinese
                                      ? `正在加载${scopeLabel}`
                                      : `Loading ${scopeLabel.toLowerCase()}`
                                  : scopeLabel
                        }
                    >
                        {visibleConversationLoadError
                            ? isChinese
                                ? '上下文未加载'
                                : 'Context unavailable'
                            : isConversationLoadPending
                              ? isChinese
                                  ? '加载上下文…'
                                  : 'Loading context…'
                              : scopeLabel}
                    </span>
                    <label className="sr-only" htmlFor="chat-conversation-selector">
                        {threadLabel}
                    </label>
                    <select
                        id="chat-conversation-selector"
                        aria-label={threadLabel}
                        className="h-6 max-w-32 rounded border border-border/60 bg-background px-1.5 text-[10px] text-foreground outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                        value={isNewConversationDraft ? '' : conversationId || ''}
                        disabled={!isScopeReady}
                        onChange={event => {
                            const nextConversationId = event.target.value;
                            if (nextConversationId) void selectConversation(nextConversationId);
                        }}
                    >
                        {isNewConversationDraft && <option value="">{draftThreadLabel}</option>}
                        {conversationOptions.map((option, index) => {
                            const stamp = option.updatedAt || option.createdAt;
                            const label = stamp
                                ? new Intl.DateTimeFormat(locale, {
                                      month: 'numeric',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                  }).format(new Date(stamp))
                                : String(index + 1);
                            return (
                                <option key={option.id} value={option.id}>
                                    {`${threadLabel} ${conversationOptions.length - index} · ${label}`}
                                </option>
                            );
                        })}
                    </select>
                </div>
                <TooltipProvider delayDuration={0}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="mr-1 h-6 w-6 text-foreground/60 hover:text-foreground"
                                onClick={() => clearConversation()}
                                disabled={!isScopeReady || !conversationId}
                                aria-label={t('clear')}
                            >
                                <TrashIcon className="h-3 w-3" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent sideOffset={10}>{t('clear')}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-[10px] hover:bg-accent"
                                onClick={startNewConversation}
                                disabled={!isScopeReady}
                            >
                                <MessageSquarePlus className="mr-1 h-3 w-3" />
                                {t('newConversation')}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent sideOffset={10}>{t('newConversation')}</TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </div>

            {/* 聊天内容区域 */}
            <div className="flex-1 space-y-3 overflow-y-auto p-2">
                {visibleConversationLoadError ? (
                    <div
                        role="alert"
                        className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-foreground"
                    >
                        <div className="font-medium">
                            {isChinese
                                ? '已保存的对话上下文未加载'
                                : 'Saved conversation context did not load'}
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                            {isChinese
                                ? '不会把它当作空对话继续发送。请重试；加载成功后才会恢复该语段的历史消息。'
                                : 'This is not treated as an empty conversation. Retry first; this segment’s saved history will return only after a successful load.'}
                        </p>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="mt-2 h-7 px-2 text-[10px]"
                            onClick={retryConversationLoad}
                            disabled={isConversationLoading}
                        >
                            {isChinese ? '重试加载' : 'Retry load'}
                        </Button>
                    </div>
                ) : isConversationLoadPending ? (
                    <div
                        role="status"
                        className="rounded-md border bg-muted/30 p-3 text-[11px] text-muted-foreground"
                    >
                        {isChinese
                            ? `正在加载${scopeLabel}，历史消息尚不可用。`
                            : `Loading ${scopeLabel.toLowerCase()}; saved messages are not available yet.`}
                    </div>
                ) : visibleChatbarContent.length === 0 ? (
                    <div className="rounded-md border bg-muted/30 p-3 text-xs">
                        <div className="mb-1 font-medium text-foreground">
                            {t('welcomeMessage.title')}
                        </div>
                        <div className="mb-3 text-[11px] text-muted-foreground">
                            {t('welcomeMessage.description')}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {examples.map(ex => (
                                <Button
                                    key={ex}
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setInput(ex)}
                                    disabled={!isScopeReady}
                                    className="min-h-6 max-w-full whitespace-normal break-words px-2 py-1 text-left text-[10px] leading-tight transition-colors hover:bg-accent"
                                >
                                    <span className="block w-full text-left">{ex}</span>
                                </Button>
                            ))}
                        </div>
                    </div>
                ) : null}

                {visibleChatbarContent.map((message, index) => {
                    const isUser = message.role === 'user';
                    return (
                        <div
                            key={index}
                            className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}
                        >
                            <div
                                className={cn(
                                    'flex max-w-[90%] items-start gap-2',
                                    isUser ? 'flex-row-reverse' : 'flex-row'
                                )}
                            >
                                <span
                                    aria-label={isUser ? t('userAvatar') : t('aiAvatar')}
                                    className={cn(
                                        'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-[6px] border',
                                        isUser
                                            ? 'border-primary bg-primary text-primary-foreground'
                                            : 'border-border/60 bg-muted text-foreground/65'
                                    )}
                                >
                                    {isUser ? (
                                        <UserRound className="h-3.5 w-3.5" strokeWidth={1.9} />
                                    ) : (
                                        <Wand className="h-3.5 w-3.5" strokeWidth={1.9} />
                                    )}
                                </span>
                                <div
                                    className={cn(
                                        'max-w-full select-text whitespace-pre-wrap break-words rounded-md px-2.5 py-1.5 text-xs',
                                        isUser
                                            ? 'bg-primary text-primary-foreground'
                                            : 'border border-border/50 bg-muted/50 text-foreground'
                                    )}
                                >
                                    {!isUser && hasMarkdownFormat(message.content) ? (
                                        <div className="markdown-content text-xs leading-none [&_.wmde-markdown]:!bg-transparent [&_.wmde-markdown]:!text-xs [&_.wmde-markdown]:!leading-none [&_.wmde-markdown]:!text-foreground [&_.wmde-markdown_*]:!my-0 [&_.wmde-markdown_*]:!bg-transparent [&_.wmde-markdown_*]:!text-xs [&_.wmde-markdown_*]:!leading-none [&_.wmde-markdown_*]:!text-foreground [&_.wmde-markdown_a]:!bg-transparent [&_.wmde-markdown_a]:!text-primary [&_.wmde-markdown_a]:!underline [&_.wmde-markdown_blockquote]:!my-0 [&_.wmde-markdown_blockquote]:!mb-0 [&_.wmde-markdown_blockquote]:!mt-0 [&_.wmde-markdown_blockquote]:!border-l-2 [&_.wmde-markdown_blockquote]:!border-border/30 [&_.wmde-markdown_blockquote]:!bg-muted/10 [&_.wmde-markdown_blockquote]:!py-0.5 [&_.wmde-markdown_blockquote]:!pl-2 [&_.wmde-markdown_blockquote]:!text-xs [&_.wmde-markdown_blockquote]:!italic [&_.wmde-markdown_blockquote]:!text-foreground [&_.wmde-markdown_code]:!rounded [&_.wmde-markdown_code]:!border [&_.wmde-markdown_code]:!border-border/20 [&_.wmde-markdown_code]:!bg-muted/30 [&_.wmde-markdown_code]:!px-1 [&_.wmde-markdown_code]:!py-0.5 [&_.wmde-markdown_code]:!font-mono [&_.wmde-markdown_code]:!text-xs [&_.wmde-markdown_code]:!text-foreground [&_.wmde-markdown_em]:!bg-transparent [&_.wmde-markdown_em]:!italic [&_.wmde-markdown_em]:!text-foreground [&_.wmde-markdown_h1]:!mb-0 [&_.wmde-markdown_h1]:!mt-0 [&_.wmde-markdown_h1]:!bg-transparent [&_.wmde-markdown_h1]:!text-xs [&_.wmde-markdown_h1]:!font-bold [&_.wmde-markdown_h1]:!text-foreground [&_.wmde-markdown_h2]:!mb-0 [&_.wmde-markdown_h2]:!mt-0 [&_.wmde-markdown_h2]:!bg-transparent [&_.wmde-markdown_h2]:!text-xs [&_.wmde-markdown_h2]:!font-semibold [&_.wmde-markdown_h2]:!text-foreground [&_.wmde-markdown_h3]:!mb-0 [&_.wmde-markdown_h3]:!mt-0 [&_.wmde-markdown_h3]:!bg-transparent [&_.wmde-markdown_h3]:!text-xs [&_.wmde-markdown_h3]:!font-medium [&_.wmde-markdown_h3]:!text-foreground [&_.wmde-markdown_h4]:!mb-0 [&_.wmde-markdown_h4]:!mt-0 [&_.wmde-markdown_h4]:!bg-transparent [&_.wmde-markdown_h4]:!text-xs [&_.wmde-markdown_h4]:!font-medium [&_.wmde-markdown_h4]:!text-foreground [&_.wmde-markdown_h5]:!mb-0 [&_.wmde-markdown_h5]:!mt-0 [&_.wmde-markdown_h5]:!bg-transparent [&_.wmde-markdown_h5]:!text-xs [&_.wmde-markdown_h5]:!font-medium [&_.wmde-markdown_h5]:!text-foreground [&_.wmde-markdown_h6]:!mb-0 [&_.wmde-markdown_h6]:!mt-0 [&_.wmde-markdown_h6]:!bg-transparent [&_.wmde-markdown_h6]:!text-xs [&_.wmde-markdown_h6]:!font-medium [&_.wmde-markdown_h6]:!text-foreground [&_.wmde-markdown_hr]:!my-1 [&_.wmde-markdown_hr]:!border-border/30 [&_.wmde-markdown_hr]:!bg-transparent [&_.wmde-markdown_li]:!mb-0 [&_.wmde-markdown_li]:!bg-transparent [&_.wmde-markdown_li]:!text-xs [&_.wmde-markdown_li]:!leading-none [&_.wmde-markdown_li]:!text-foreground [&_.wmde-markdown_ol]:!mb-0 [&_.wmde-markdown_ol]:!mt-0 [&_.wmde-markdown_ol]:!bg-transparent [&_.wmde-markdown_ol]:!pl-3 [&_.wmde-markdown_ol]:!text-xs [&_.wmde-markdown_ol]:!text-foreground [&_.wmde-markdown_p]:!my-0 [&_.wmde-markdown_p]:!mb-0 [&_.wmde-markdown_p]:!mt-0 [&_.wmde-markdown_p]:!bg-transparent [&_.wmde-markdown_p]:!text-xs [&_.wmde-markdown_p]:!leading-none [&_.wmde-markdown_p]:!text-foreground [&_.wmde-markdown_pre]:!my-0 [&_.wmde-markdown_pre]:!mb-0 [&_.wmde-markdown_pre]:!mt-0 [&_.wmde-markdown_pre]:!overflow-x-auto [&_.wmde-markdown_pre]:!rounded [&_.wmde-markdown_pre]:!border [&_.wmde-markdown_pre]:!border-border/30 [&_.wmde-markdown_pre]:!bg-muted/30 [&_.wmde-markdown_pre]:!p-1 [&_.wmde-markdown_pre]:!text-xs [&_.wmde-markdown_pre]:!text-foreground [&_.wmde-markdown_strong]:!bg-transparent [&_.wmde-markdown_strong]:!font-semibold [&_.wmde-markdown_strong]:!text-foreground [&_.wmde-markdown_table]:!w-full [&_.wmde-markdown_table]:!border-collapse [&_.wmde-markdown_table]:!bg-transparent [&_.wmde-markdown_table]:!text-xs [&_.wmde-markdown_td]:!border [&_.wmde-markdown_td]:!border-border/30 [&_.wmde-markdown_td]:!bg-transparent [&_.wmde-markdown_td]:!px-1 [&_.wmde-markdown_td]:!py-0.5 [&_.wmde-markdown_td]:!text-xs [&_.wmde-markdown_td]:!text-foreground [&_.wmde-markdown_th]:!border [&_.wmde-markdown_th]:!border-border/30 [&_.wmde-markdown_th]:!bg-muted/20 [&_.wmde-markdown_th]:!px-1 [&_.wmde-markdown_th]:!py-0.5 [&_.wmde-markdown_th]:!text-xs [&_.wmde-markdown_th]:!font-medium [&_.wmde-markdown_th]:!text-foreground [&_.wmde-markdown_ul]:!mb-0 [&_.wmde-markdown_ul]:!mt-0 [&_.wmde-markdown_ul]:!bg-transparent [&_.wmde-markdown_ul]:!pl-3 [&_.wmde-markdown_ul]:!text-xs [&_.wmde-markdown_ul]:!text-foreground">
                                            <MarkdownPreview source={message.content} />
                                        </div>
                                    ) : message.content.trim() === t('processing') ? (
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            <div className="flex space-x-1">
                                                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]"></div>
                                                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]"></div>
                                                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-current"></div>
                                            </div>
                                            <span className="text-xs">{t('loading')}</span>
                                        </div>
                                    ) : (
                                        <span>{message.content}</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* 输入区域 - 与IDE风格一致 */}
            <div className="border-t bg-muted/20 p-2">
                {/* 选中的智能体指示器 */}
                {selectedAgents.length > 0 && (
                    <div className="mb-2 flex flex-wrap items-center gap-1">
                        <span className="text-[10px] text-muted-foreground">使用智能体:</span>
                        {selectedAgents.map(agent => (
                            <div
                                key={agent.key}
                                className="flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-[10px] text-primary"
                            >
                                <AgentGlyph agent={agent} size="sm" />
                                <span>{agent.name}</span>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-4 w-4 p-0 hover:bg-primary/20"
                                    disabled={!isScopeReady}
                                    onClick={() =>
                                        setSelectedAgents(
                                            selectedAgents.filter(a => a.key !== agent.key)
                                        )
                                    }
                                >
                                    <TrashIcon className="h-2 w-2" />
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
                <form
                    onSubmit={async event => {
                        event.preventDefault();
                        if (!isScopeReady || !normalizedInput.content) return;
                        const selectedAgent = selectedAgents[0];
                        const userInput = normalizedInput.content;
                        const scopeKey = currentScopeKey;
                        if (normalizedInput.truncated) toast.info(inputLimitNotice);
                        // The exact clamped text is shown locally, sent to the
                        // service, and then stored by the server.
                        const userMessageId =
                            globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
                        addMessage({ id: userMessageId, role: 'user', content: userInput });
                        setInput('');
                        inputWasTruncatedRef.current = false;
                        setIsChatSubmitting(true);
                        const request = beginActiveRequest();
                        const captureConversationId = (nextConversationId: string) => {
                            if (!request.isFresh()) return;
                            if (currentScopeKeyRef.current !== scopeKey) return;
                            conversationIdRef.current = nextConversationId;
                            newConversationBaseIdRef.current = nextConversationId;
                            setConversationId(nextConversationId);
                            setIsNewConversationDraft(false);
                            setConversationOptions(previous =>
                                previous.some(option => option.id === nextConversationId)
                                    ? previous
                                    : [{ id: nextConversationId }, ...previous]
                            );
                        };
                        const conversationRequest = {
                            conversationId: conversationIdRef.current || undefined,
                            newConversation: isNewConversationDraft,
                            ...(isNewConversationDraft
                                ? {
                                      expectedActiveConversationId:
                                          newConversationBaseIdRef.current,
                                  }
                                : {}),
                        };
                        // A selected item becomes active before its editor text
                        // arrives. Never attach the previous item's local
                        // source/target draft to this new conversation scope;
                        // the server will use the persisted selected segment
                        // until the matching editor payload is ready.
                        const requestContext = {
                            ...currentContext,
                            ...(conversationScope.usesLoadedDocumentItem
                                ? { sourceText, targetText }
                                : {}),
                        };
                        const streamOptions = {
                            initialMessage: t('processing'),
                            signal: request.signal,
                            isFresh: request.isFresh,
                            // A response header/bare id exists before a normal
                            // streamed turn is committed. Only the terminal
                            // `turnStatus: persisted` frame invokes this.
                            requirePersistedTurn: true,
                            onConversationId: captureConversationId,
                            locale,
                        };

                        try {
                            if (selectedAgent) {
                                await handleStreamResponse(
                                    {
                                        url: '/api/chat/agent',
                                        data: {
                                            agentKey: selectedAgent.key,
                                            prompt: userInput,
                                            locale,
                                            ...conversationRequest,
                                            context: requestContext,
                                        },
                                    },
                                    streamOptions
                                );
                            } else {
                                await handleStreamResponse(
                                    {
                                        url: '/api/chat',
                                        data: {
                                            prompt: userInput,
                                            locale,
                                            ...conversationRequest,
                                            context: requestContext,
                                        },
                                    },
                                    streamOptions
                                );
                            }
                        } catch (error) {
                            await reconcileUncommittedTurn({
                                scopeKey,
                                context: currentContext,
                                isNewConversation: conversationRequest.newConversation,
                                conversationId: conversationRequest.conversationId,
                                userMessageId,
                                prompt: userInput,
                                isRequestFresh: request.isFresh,
                                error,
                            });
                        } finally {
                            request.finish();
                            if (currentScopeKeyRef.current === scopeKey) {
                                setIsChatSubmitting(false);
                            }
                        }
                    }}
                    className="flex w-full items-end gap-2"
                >
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="mb-0.5 size-8 shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={() => setIsInputExpanded(expanded => !expanded)}
                        disabled={!isScopeReady}
                        aria-label={inputResizeLabel}
                        title={inputResizeLabel}
                    >
                        {isInputExpanded ? (
                            <Minimize2 className="size-3.5" aria-hidden="true" />
                        ) : (
                            <Maximize2 className="size-3.5" aria-hidden="true" />
                        )}
                    </Button>
                    <Textarea
                        ref={inputRef}
                        id="message"
                        placeholder={t('placeholder')}
                        rows={1}
                        className={cn(
                            'min-h-9 flex-1 resize-y border-border/50 px-2.5 py-2 text-xs leading-5 focus:border-primary/50',
                            isInputExpanded ? 'max-h-[360px]' : 'max-h-40'
                        )}
                        autoComplete="off"
                        autoFocus
                        value={input}
                        disabled={!isScopeReady}
                        onChange={event => {
                            const next = normalizeChatUserPrompt(event.target.value);
                            setInput(next.content);
                            if (next.truncated && !inputWasTruncatedRef.current) {
                                toast.info(inputLimitNotice);
                            }
                            inputWasTruncatedRef.current = next.truncated;
                        }}
                        onKeyDown={e => {
                            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                                e.preventDefault();
                                const form = e.currentTarget.form;
                                if (form) {
                                    form.requestSubmit();
                                }
                            }
                        }}
                    />
                    <Button
                        type="submit"
                        size="sm"
                        className="h-9 px-2 text-xs"
                        disabled={!isScopeReady || !normalizedInput.content}
                        aria-label={t('send')}
                    >
                        <PaperPlaneIcon className="h-3 w-3" />
                    </Button>
                </form>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={toggleDialog}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-sm">{t('newMessage')}</DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground">
                            {t('chatWithAI')}
                        </DialogDescription>
                    </DialogHeader>
                    <Command className="rounded-md border">
                        <CommandInput placeholder="搜索智能体..." className="text-xs" />
                        <CommandList>
                            <CommandEmpty className="py-2 text-xs text-muted-foreground">
                                未找到智能体
                            </CommandEmpty>
                            <CommandGroup className="p-1">
                                {agents.map(agent => (
                                    <CommandItem
                                        key={agent.key}
                                        className="flex items-center px-2 py-1.5 text-xs"
                                        onSelect={() => {
                                            if (selectedAgents.includes(agent)) {
                                                // 如果已选择，则取消选择
                                                setSelectedAgents([]);
                                            } else {
                                                // 如果未选择，则只选择这一个智能体（单选）
                                                setSelectedAgents([agent]);
                                            }
                                        }}
                                    >
                                        <span className="mr-2">
                                            <AgentGlyph agent={agent} />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-xs font-medium leading-none">
                                                {agent.name}
                                            </p>
                                            <p className="truncate text-[10px] text-muted-foreground">
                                                {agent.description}
                                            </p>
                                        </div>
                                        {selectedAgents.includes(agent) ? (
                                            <CheckIcon className="ml-auto h-3 w-3 text-primary" />
                                        ) : null}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                    <DialogFooter className="flex items-center justify-between pt-3">
                        {selectedAgents.length > 0 ? (
                            <div className="flex -space-x-1">
                                {selectedAgents.map(agent => (
                                    <span key={agent.key} className="border border-background">
                                        <AgentGlyph agent={agent} />
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-muted-foreground">
                                {t('selectAgentPrompt')}
                            </p>
                        )}
                        <Button
                            disabled={selectedAgents.length < 1}
                            onClick={toggleDialog}
                            size="sm"
                            className="text-xs"
                        >
                            {t('continue')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
