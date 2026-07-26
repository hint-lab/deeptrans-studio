// 动作部分：包含预翻译、质量评估、译后编辑等
import {
    embedAndTranslateAction,
    extractMonolingualTermsAction,
    lookupDictionaryAction,
} from '@/actions/pre-translate';
import { getSourceEditorInstance, useTargetEditor } from '@/hooks/useEditor';
import { useTranslationContent, useTranslationState } from '@/hooks/useTranslation';
import { toast } from 'sonner';
import { PostEditMenu } from './components/post-edit-menu';
import { QualityMenu } from './components/quality-menu';
import { RunMenu } from './components/run-menu';
import { TranslateMenu } from './components/translate-menu';
// 改为通过 API 路由调用，避免前端解析服务端依赖
import { runQualityAssureAction } from '@/actions/quality-assure';
// 改为通过 API 路由调用，避免前端解析服务端依赖
import {
    savePreTranslateResultsAction,
    savePostEditResultsAction,
    saveQualityAssureResultsAction,
} from '@/actions/intermediate-results';
import { useTranslationLanguage } from '@/hooks/useTranslation';

import {
    completeQualityAssureAction,
    completePreTranslationAction,
    getContentByIdAction,
    signOffPostEditReviewAction,
    startQualityAssureAction,
    startPreTranslationAction,
    updateDocItemStatusAction,
} from '@/actions/document-item';
import { runPostEditAction } from '@/actions/postedit';
import { recordGoToNextTranslationProcessEventAction } from '@/actions/translation-process-event';
import { useAgentWorkflowSteps } from '@/hooks/useAgentWorkflowSteps';
import { useExplorerTabs } from '@/hooks/useExplorerTabs';
import { useLogger } from '@/hooks/useLogger';
import type { DocumentItemTab } from '@/types/explorerTabs';
import { useEffect, useRef, useState } from 'react';

import { useActiveDocumentItem } from '@/hooks/useActiveDocumentItem';
import { useRunningState } from '@/hooks/useRunning';
import { useUserSettings } from '@/hooks/useUserSettings';
import {
    beginBatchQACancel,
    canPersistBatchQAResults,
    isBatchQACancelConfirmed,
    resolveBatchQACancelAttempt,
    type BatchQACancelState,
} from '@/lib/batch-qa-cancellation';
import {
    beginBatchPreTranslateCancel,
    canPersistBatchPreTranslateResults,
    isBatchPreTranslateCancelConfirmed,
    resolveBatchPreTranslateCancelAttempt,
    type BatchPreTranslateCancelState,
} from '@/lib/batch-pre-translate-cancellation';
import { BATCH_CLIENT_MESSAGES, resolveBatchClientErrorMessage } from '@/lib/batch-client-error';
import { partitionBatchQAWorkflowItems } from '@/lib/batch-qa-stage-eligibility';
import { buildBatchSignoffInput } from '@/lib/batch-signoff-input';
import { createLogger } from '@/lib/logger';
import { resolvePreTranslationStartFailure } from '@/lib/ide-client-error';
import { runCancelableSequence } from '@/lib/batch-signoff-sequence';
import { normalizeKeyboardKey, shouldHandleIDEGlobalShortcut } from '@/lib/keyboard-key';
import { calculateOneClickWorkflowProgress } from '@/lib/one-click-workflow-progress';
import { hasUnsavedPostEditDraft } from '@/lib/post-edit-draft-navigation';
import { resolveSingleQaClientErrorMessage } from '@/lib/translation-client-error';
import {
    completePostEditOutcome,
    failedPostEditOutcome,
    type PostEditOutcomePhase,
} from '@/lib/post-edit-query-outcome';
import { useSession } from 'next-auth/react';
import { useLocale, useTranslations } from 'next-intl';
import { useState as useReactState } from 'react';
import { KeyboardShortcutsDialog, type ShortcutItem } from '../keyboard-shortcuts-dialog';
import { PreferencesDialog } from '../preferences-dialog';
import BatchProgressDialog from './components/batch-progress-dialog';
const logger = createLogger(
    {
        type: 'action:action-section',
    },
    {
        json: false, // 开启json格式输出
        pretty: false, // 关闭开发环境美化输出
        colors: true, // 仅当json：false时启用颜色输出可用
        includeCaller: false, // 日志不包含调用者
    }
);

export function ActionSection() {
    // 在组件顶层获取所有需要的状态
    const {
        preTranslateEmbedded,
        setQASyntaxEmbedded,
        setPeStep,
        setPERunning,
        setPosteditOutputs,
        setPosteditOutcome,
    } = useAgentWorkflowSteps();
    const { logSystem, logAgent, logInfo, logWarning, logError } = useLogger();
    const { currentStage, setCurrentStage } = useTranslationState();
    const { isRunning, setIsRunning } = useRunningState();
    const { data: session } = useSession();
    const userId = session?.user?.id;
    const locale = useLocale();
    const { sourceLanguage, targetLanguage } = useTranslationLanguage();

    const {
        contentItemId,
        sourceText,
        persistedSourceText,
        targetText,
        setPersistedSourceTranslationText,
        setSourceTranslationText,
        setTargetTranslationText,
    } = useTranslationContent();
    const targetEditor = useTargetEditor();
    const { explorerTabs, setExplorerTabs } = useExplorerTabs();
    const [batchProgress, setBatchProgress] = useState<number | undefined>(undefined);
    const [batchOpen, setBatchOpen] = useState(false);
    const [progressTitle, setProgressTitle] = useState<string>('');
    const [batchJobId, setBatchJobId] = useState<string | undefined>(undefined);
    const batchCancelRef = useRef(false);
    // QA has a server-authoritative cancel-vs-persist race. Keep an intent
    // (`requested`/`requesting`) separate from a server-confirmed cancel so a
    // 409 persist-win response can never be shown as “已取消”.
    const batchQACancelStateRef = useRef<BatchQACancelState>('idle');
    const batchQACancelRequestRef = useRef<Promise<BatchQACancelState> | undefined>(undefined);
    const batchQACancelGenerationRef = useRef(0);
    const batchQACancelErrorRef = useRef<string | undefined>(undefined);
    const batchQAActiveRef = useRef(false);
    const batchQAIdRef = useRef<string | undefined>(undefined);
    // Pre-translation uses the same server-authoritative cancel-vs-persist
    // boundary as QA. A click is only a request until Redis accepts it.
    const batchPreTranslateCancelStateRef = useRef<BatchPreTranslateCancelState>('idle');
    const batchPreTranslateCancelRequestRef = useRef<
        Promise<BatchPreTranslateCancelState> | undefined
    >(undefined);
    const batchPreTranslateCancelGenerationRef = useRef(0);
    const batchPreTranslateCancelErrorRef = useRef<string | undefined>(undefined);
    const batchPreTranslateActiveRef = useRef(false);
    const batchPreTranslateIdRef = useRef<string | undefined>(undefined);
    // State updates do not synchronously disable all event sources (for
    // example, a menu click and its shortcut in the same tick). Keep a
    // synchronous gate for the local, sequential SIGN_OFF operation.
    const batchSignoffRunRef = useRef(false);

    const requestBatchQACancel = async (batchId: string) => {
        const response = await fetch('/api/batch-quality-assure/cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ batchId }),
        });
        await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(BATCH_CLIENT_MESSAGES.qaCancelUnavailable);
        }
        return undefined;
    };

    const requestBatchPreTranslateCancel = async (batchId: string) => {
        const response = await fetch('/api/batch-pre-translate/cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ batchId }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.canceled !== true) {
            throw new Error(BATCH_CLIENT_MESSAGES.preTranslateCancelUnavailable);
        }
        return payload;
    };

    const startBatchQAFlow = () => {
        batchQACancelGenerationRef.current += 1;
        batchQACancelStateRef.current = 'idle';
        batchQACancelRequestRef.current = undefined;
        batchQACancelErrorRef.current = undefined;
        batchQAIdRef.current = undefined;
        batchQAActiveRef.current = true;
    };

    const finishBatchQAFlow = () => {
        batchQACancelGenerationRef.current += 1;
        batchQACancelStateRef.current = 'idle';
        batchQACancelRequestRef.current = undefined;
        batchQACancelErrorRef.current = undefined;
        batchQAIdRef.current = undefined;
        batchQAActiveRef.current = false;
    };

    const startBatchPreTranslateFlow = () => {
        batchPreTranslateCancelGenerationRef.current += 1;
        batchPreTranslateCancelStateRef.current = 'idle';
        batchPreTranslateCancelRequestRef.current = undefined;
        batchPreTranslateCancelErrorRef.current = undefined;
        batchPreTranslateIdRef.current = undefined;
        batchPreTranslateActiveRef.current = true;
    };

    const finishBatchPreTranslateFlow = () => {
        batchPreTranslateCancelGenerationRef.current += 1;
        batchPreTranslateCancelStateRef.current = 'idle';
        batchPreTranslateCancelRequestRef.current = undefined;
        batchPreTranslateCancelErrorRef.current = undefined;
        batchPreTranslateIdRef.current = undefined;
        batchPreTranslateActiveRef.current = false;
    };

    const showBatchQACancelFailure = () => {
        const message = batchQACancelErrorRef.current;
        if (!message) return;
        batchQACancelErrorRef.current = undefined;
        toast.warning(message);
    };

    const showBatchPreTranslateCancelFailure = () => {
        const message = batchPreTranslateCancelErrorRef.current;
        if (!message) return;
        batchPreTranslateCancelErrorRef.current = undefined;
        toast.warning(message);
    };

    const settleBatchQACancel = async (batchId: string): Promise<BatchQACancelState> => {
        const currentState = batchQACancelStateRef.current;
        if (currentState === 'idle' || currentState === 'confirmed') return currentState;
        if (currentState === 'requesting') {
            return (await batchQACancelRequestRef.current) ?? batchQACancelStateRef.current;
        }

        // The user clicked cancel while the QA start request was still in
        // flight. Send that queued intent as soon as the server reveals the
        // batch id, rather than claiming a local cancellation.
        batchQACancelStateRef.current = beginBatchQACancel(currentState, true);
        const generation = batchQACancelGenerationRef.current;
        let attempt: Promise<BatchQACancelState>;
        attempt = requestBatchQACancel(batchId)
            .then(() => {
                if (generation !== batchQACancelGenerationRef.current) return 'idle';
                const nextState = resolveBatchQACancelAttempt(batchQACancelStateRef.current, true);
                batchQACancelStateRef.current = nextState;
                return nextState;
            })
            .catch(error => {
                if (generation !== batchQACancelGenerationRef.current) return 'idle';
                const nextState = resolveBatchQACancelAttempt(batchQACancelStateRef.current, false);
                batchQACancelStateRef.current = nextState;
                batchQACancelErrorRef.current = resolveBatchClientErrorMessage(
                    error,
                    BATCH_CLIENT_MESSAGES.qaCancelUnavailable
                );
                return nextState;
            })
            .finally(() => {
                if (batchQACancelRequestRef.current === attempt) {
                    batchQACancelRequestRef.current = undefined;
                }
            });
        batchQACancelRequestRef.current = attempt;
        return attempt;
    };

    const settleBatchPreTranslateCancel = async (
        batchId: string
    ): Promise<BatchPreTranslateCancelState> => {
        const currentState = batchPreTranslateCancelStateRef.current;
        if (currentState === 'idle' || currentState === 'confirmed') return currentState;
        if (currentState === 'requesting') {
            return (
                (await batchPreTranslateCancelRequestRef.current) ??
                batchPreTranslateCancelStateRef.current
            );
        }

        // A cancel click may arrive while the batch-start request is still in
        // flight. Dispatch it only after the real server batch id exists.
        batchPreTranslateCancelStateRef.current = beginBatchPreTranslateCancel(currentState, true);
        const generation = batchPreTranslateCancelGenerationRef.current;
        let attempt: Promise<BatchPreTranslateCancelState>;
        attempt = requestBatchPreTranslateCancel(batchId)
            .then(() => {
                if (generation !== batchPreTranslateCancelGenerationRef.current) return 'idle';
                const nextState = resolveBatchPreTranslateCancelAttempt(
                    batchPreTranslateCancelStateRef.current,
                    true
                );
                batchPreTranslateCancelStateRef.current = nextState;
                return nextState;
            })
            .catch(error => {
                if (generation !== batchPreTranslateCancelGenerationRef.current) return 'idle';
                const nextState = resolveBatchPreTranslateCancelAttempt(
                    batchPreTranslateCancelStateRef.current,
                    false
                );
                batchPreTranslateCancelStateRef.current = nextState;
                batchPreTranslateCancelErrorRef.current = resolveBatchClientErrorMessage(
                    error,
                    BATCH_CLIENT_MESSAGES.preTranslateCancelUnavailable
                );
                return nextState;
            })
            .finally(() => {
                if (batchPreTranslateCancelRequestRef.current === attempt) {
                    batchPreTranslateCancelRequestRef.current = undefined;
                }
            });
        batchPreTranslateCancelRequestRef.current = attempt;
        return attempt;
    };
    const [mounted, setMounted] = useState(false);
    const autoRunFlags = useRef<Record<string, boolean>>({});
    const [currentOperation, setCurrentOperation] = useState<
        | 'idle'
        | 'translate_single'
        | 'translate_batch'
        | 'evaluate_single'
        | 'evaluate_batch'
        | 'post_edit_single'
        | 'post_edit_batch'
        | 'signoff_single'
        | 'signoff_batch'
        | 'complete_batch'
    >('idle');
    const { activeDocumentItem, setActiveDocumentItem } = useActiveDocumentItem();
    const activeDocumentItemRef = useRef(activeDocumentItem);
    const activeItemIdRef = useRef(String(activeDocumentItem?.id || ''));
    const sourceTextRef = useRef(String(sourceText || ''));
    const targetTextRef = useRef(String(targetText || ''));
    const qaTargetTextRef = useRef(String(targetText || preTranslateEmbedded || ''));
    activeDocumentItemRef.current = activeDocumentItem;
    activeItemIdRef.current = String(activeDocumentItem?.id || '');
    sourceTextRef.current = String(sourceText || '');
    targetTextRef.current = String(targetText || '');
    qaTargetTextRef.current = String(targetText || preTranslateEmbedded || '');
    const { settings } = useUserSettings();
    const chosenProvider = settings.provider || 'openai';

    // 快捷键对话框
    const [shortcutsOpen, setShortcutsOpen] = useReactState(false);
    const [preferencesOpen, setPreferencesOpen] = useReactState(false);
    const shortcuts: ShortcutItem[] = [
        { id: 'batchTranslate', combo: '⌘B', description: '批量翻译未开始分段' },
        { id: 'batchEvaluate', combo: '⌘E', description: '批量质检预翻译复核分段' },
        { id: 'batchPostEdit', combo: '⌘P', description: '批量译后编辑' },
        { id: 'batchSignoff', combo: '⌘⇧S', description: '批量签发' },
        { id: 'openShortcuts', combo: '⌘/', description: '打开快捷键' },
        { id: 'rollback', combo: '⌘[', description: '回退阶段' },
        { id: 'advance', combo: '⌘]', description: '前进阶段' },
    ];

    useEffect(() => {
        setMounted(true);
    }, []);

    // 当进入某个阶段时自动触发对应动作（一次性）
    useEffect(() => {
        if (!mounted) return;
        if (!activeDocumentItem?.id) return;
        if (isRunning) return;
        const key = `${activeDocumentItem.id}:${currentStage}`;
        if (autoRunFlags.current[key]) return;
        // 重置依赖于分段与阶段
    }, [mounted, activeDocumentItem?.id, currentStage, isRunning, currentOperation]);

    // 同步本地状态（activeDocumentItem 与 explorerTabs）
    const syncLocalStatusById = (id: string, status: string) => {
        try {
            if (!id) return;
            // 仅在状态发生变化时更新列表，减少无效重渲染
            setExplorerTabs((prev: any) => {
                if (!prev || !prev.documentTabs) return prev;
                let changed = false;
                const nextTabs = prev.documentTabs.map((tab: any) => ({
                    ...tab,
                    items: tab.items?.map((it: any) => {
                        if (it.id === id) {
                            if (it.status !== status) {
                                changed = true;
                                return { ...it, status };
                            }
                        }
                        return it;
                    }),
                }));
                return changed ? { ...prev, documentTabs: nextTabs } : prev;
            });
            if (activeItemIdRef.current === String(id)) {
                const currentItem = activeDocumentItemRef.current;
                setActiveDocumentItem({ ...currentItem, status });
            }
        } catch {}
    };
    const setPreRunning = useAgentWorkflowSteps((s: any) => s.setPreRunning);
    const setPreStep = useAgentWorkflowSteps((s: any) => s.setPreStep);
    const setPreOutputs = useAgentWorkflowSteps((s: any) => s.setPreOutputs);
    const setQARunning = useAgentWorkflowSteps((s: any) => s.setQARunning);
    const setQAStep = useAgentWorkflowSteps((s: any) => s.setQAStep);
    const setQAOutputs = useAgentWorkflowSteps((s: any) => s.setQAOutputs);

    const handlePreTranslationAction = async (provider: string = 'openai') => {
        let resultPersisted = false;
        try {
            // 检查前置条件
            const id = String((activeDocumentItem as any)?.id || '');
            if (!id) {
                toast.error('没有激活的文档项，无法进行预翻译');
                return;
            }
            if (contentItemId !== id) {
                toast.info('当前分段仍在加载，请加载完成后再启动预翻译');
                return;
            }
            let currentItemStatus = activeDocumentItem?.status;
            // 从 explorerTabs 中查找最新的状态
            const tabs = explorerTabs?.documentTabs ?? [];
            for (const tab of tabs) {
                const item = (tab.items ?? []).find((it: any) => it.id === id);
                if (item) {
                    currentItemStatus = item.status;
                    break;
                }
            }
            // 检查当前状态是否允许质检（应该在 NOT_STARTED 状态）
            if (currentItemStatus !== 'NOT_STARTED') {
                toast.error(
                    `当前分段状态为 ${currentItemStatus || '未知'}，无法进行预翻译。仅在未开始阶段允许预翻译`
                );
                return;
            }

            // 检查文本内容
            const expectedSourceText = String(persistedSourceText || '');
            let currentText = String(sourceText || '');
            try {
                const sourceEditor = getSourceEditorInstance();
                if (
                    sourceEditor?.view.dom.getAttribute('data-deeptrans-editor-item-id') === id &&
                    sourceEditor.view.dom.getAttribute('data-deeptrans-editor-job') === 'rawtext' &&
                    sourceEditor.view.dom.getAttribute('data-deeptrans-editor-dirty') === 'true'
                ) {
                    currentText = sourceEditor.getHTML();
                }
            } catch {}
            if (!currentText.trim()) {
                toast.error('原文内容为空，无法进行预翻译');
                return;
            }
            const isCurrentItem = () => activeItemIdRef.current === id;
            logAgent('翻译开始');

            setIsRunning(true);
            setCurrentOperation('translate_single');

            // Claim MT on the server before any model call. A generic
            // MT->MT update is intentionally not enough here: it would let
            // two browser tabs run and later compete to publish a result.
            try {
                const sourceEditor = getSourceEditorInstance();
                if (
                    sourceEditor?.view.dom.getAttribute('data-deeptrans-editor-item-id') === id &&
                    sourceEditor.view.dom.getAttribute('data-deeptrans-editor-job') === 'rawtext'
                ) {
                    sourceEditor.setEditable(false);
                }
            } catch {}
            const startedItem = await startPreTranslationAction(id, expectedSourceText, currentText);
            const claimedSourceText = String((startedItem as any)?.sourceText ?? currentText);
            const expectedTargetText = String((startedItem as any)?.targetText || '');
            const preTranslateRunId = String((startedItem as any)?.preTranslateRunId || '').trim();
            if (!preTranslateRunId) {
                throw new Error('预翻译运行标识缺失，请刷新后重试');
            }
            syncLocalStatusById(id, 'MT');
            if (isCurrentItem()) {
                setSourceTranslationText(claimedSourceText);
                setPersistedSourceTranslationText(claimedSourceText);
                try {
                    const sourceEditor = getSourceEditorInstance();
                    if (
                        sourceEditor?.view.dom.getAttribute('data-deeptrans-editor-item-id') === id &&
                        sourceEditor.view.dom.getAttribute('data-deeptrans-editor-job') === 'rawtext' &&
                        sourceEditor.getHTML() === claimedSourceText
                    ) {
                        sourceEditor.view.dom.setAttribute('data-deeptrans-editor-dirty', 'false');
                    }
                } catch {}
                setCurrentStage('MT');
            }

            let terms: any[] = [];
            let dict: any[] = [];
            let embedded = '';
            // 预翻译三步：单语术语提取 → 词典查询 → 术语嵌入
            try {
                setPreRunning(true);
                setPreStep('mono-term-extract');
                logAgent('预翻译 · 术语抽取');
                terms = await extractMonolingualTermsAction(claimedSourceText, {
                    locale: locale,
                });
                if (isCurrentItem()) setPreOutputs({ itemId: id, terms });

                setPreStep('dict-lookup');
                logAgent('预翻译 · 词典查询');
                // 使用抽取到的术语进行数据库词典多轮查询
                // 优先用术语查询；若术语为空，回退用全文前缀切分成若干 token 进行兜底查询
                const termList = (terms || []).map((x: any) => x.term).filter(Boolean);
                if (termList.length) {
                    // 将字符串数组转换为 TermCandidate 数组
                    const termCandidates = termList
                        .slice(0, 50)
                        .map(term => ({ term, score: 1.0 }));
                    dict = await lookupDictionaryAction(termCandidates, {
                        projectId:
                            String((explorerTabs as any)?.projectId || '').trim() || undefined,
                    });
                } else {
                    const tokens = claimedSourceText
                        .split(/[\s,.;，。；、]+/)
                        .filter(Boolean)
                        .slice(0, 10);
                    dict = await lookupDictionaryAction(
                        tokens.map((x: any) => ({ term: x, score: 1.0 })),
                        {
                            projectId:
                                String((explorerTabs as any)?.projectId || '').trim() || undefined,
                        }
                    );
                }
                if (isCurrentItem()) setPreOutputs({ itemId: id, dict });

                setPreStep('term-embed-trans');
                logAgent('预翻译 · 术语嵌入');
                embedded = await embedAndTranslateAction(
                    claimedSourceText,
                    sourceLanguage || 'auto',
                    targetLanguage || 'auto',
                    dict,
                    { locale: locale }
                );
                if (isCurrentItem()) setPreOutputs({ itemId: id, translation: embedded });
            } finally {
                setPreRunning(false);
                setPreStep('idle');
            }

            // 上面的三步已产出最终嵌入译文，不再重复执行整条模型链。
            const translatedText = embedded || '';
            if (!translatedText.trim()) {
                throw new Error('预翻译未返回有效译文，无法进入人工复核');
            }

            // 先持久化再更新界面，避免写入失败时误显示为“已应用”。
            // expectedTargetText comes from the server-side claim, rather
            // than a provisional local baseline, so a concurrent durable edit
            // cannot be overwritten by this delayed model result.
            try {
                await savePreTranslateResultsAction(
                    id,
                    {
                        terms,
                        dict,
                        embedded,
                        targetText: translatedText,
                    },
                    claimedSourceText,
                    expectedTargetText,
                    preTranslateRunId
                );
                resultPersisted = true;
                logInfo('预翻译结果已保存到数据库');
            } catch (error) {
                logError('保存预翻译结果失败，请稍后重试');
                throw error;
            }

            // Only the server may promote MT to review, and only after it has
            // confirmed the saved result still belongs to this item/source.
            // Do this before updating any visible target text or showing a
            // success toast so a concurrent tab cannot create a false local
            // completion.
            await completePreTranslationAction(id, preTranslateRunId);
            syncLocalStatusById(id, 'MT_REVIEW');

            if (isCurrentItem()) {
                setPreOutputs({
                    itemId: id,
                    terms,
                    dict,
                    translation: embedded,
                });
                setTargetTranslationText(translatedText);
                if (targetEditor?.editor) {
                    targetEditor.editor.commands.setContent(translatedText);
                }
                setCurrentStage('MT_REVIEW');
                toast.success('翻译完成：翻译已完成并更新到目标编辑器');
                logAgent('翻译完成');
            }
        } catch (error) {
            logger.error('翻译失败:', error);
            const startFailure = resultPersisted
                ? null
                : resolvePreTranslationStartFailure(error);
            toast.error(
                resultPersisted
                    ? '预翻译结果已保存，但未能安全进入复核。请刷新后确认分段状态。'
                    : startFailure || '翻译失败：请检查网络连接或稍后再试'
            );
            logError('翻译失败，请检查网络连接或稍后重试');
        } finally {
            setIsRunning(false);
            setCurrentOperation('idle');
        }
    };

    const handleBatchTranslate = async () => {
        let startedBatchId: string | undefined;
        try {
            setCurrentOperation('translate_batch');
            setProgressTitle('批量翻译中');
            setBatchOpen(true);
            batchCancelRef.current = false;
            const tabs = explorerTabs?.documentTabs ?? [];

            // 只获取未开始状态的分段
            const notStartedItems: DocumentItemTab[] = tabs.flatMap(t =>
                (t.items ?? []).filter((item: any) => item.status === 'NOT_STARTED' || !item.status)
            );

            const total = notStartedItems.length;
            if (!total) {
                toast.error('没有需要翻译的分段：所有分段都已开始或完成');
                setBatchOpen(false);
                setCurrentOperation('idle');
                return;
            }

            startBatchPreTranslateFlow();
            setIsRunning(true);
            setBatchProgress(0);
            logInfo(`批量翻译开始（服务端并发）：共 ${total} 个未开始分段`);

            // 只处理未开始的分段
            const itemIds = notStartedItems.map(i => i.id);
            const startResponse = await fetch('/api/batch-pre-translate/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    itemIds,
                    sourceLanguage: sourceLanguage || 'auto',
                    targetLanguage: targetLanguage || 'auto',
                }),
            });
            const startRes = await startResponse.json().catch(() => ({}));

            const { batchId } = startRes || {};
            if (!startResponse.ok || !batchId) {
                throw new Error(BATCH_CLIENT_MESSAGES.translateStartFailed);
            }

            startedBatchId = String(batchId);
            setBatchJobId(batchId);
            batchPreTranslateIdRef.current = batchId;
            const startCancelState = await settleBatchPreTranslateCancel(batchId);
            showBatchPreTranslateCancelFailure();
            if (isBatchPreTranslateCancelConfirmed(startCancelState)) {
                throw new Error('批量预译已取消');
            }
            let progress:
                | {
                      percent?: number;
                      done?: number;
                      failed?: number;
                      terminal?: boolean;
                      canceled?: boolean;
                      error?: string;
                  }
                | undefined;
            for (let tries = 0; tries < 600; tries += 1) {
                const cancelState = await settleBatchPreTranslateCancel(batchId);
                showBatchPreTranslateCancelFailure();
                if (isBatchPreTranslateCancelConfirmed(cancelState)) {
                    throw new Error('批量预译已取消');
                }
                const progressResponse = await fetch(
                    `/api/batch-pre-translate/progress?batchId=${encodeURIComponent(batchId)}`
                );
                const nextProgress: NonNullable<typeof progress> = await progressResponse
                    .json()
                    .catch(() => ({}));
                progress = nextProgress;
                if (!progressResponse.ok) {
                    throw new Error(BATCH_CLIENT_MESSAGES.translateProgressFailed);
                }
                nextProgress.terminal =
                    nextProgress.terminal ?? Number(nextProgress.percent || 0) >= 100;
                setBatchProgress(Number(nextProgress.percent || 0));
                if (nextProgress.canceled) {
                    batchPreTranslateCancelStateRef.current = 'confirmed';
                    throw new Error('批量预译已取消');
                }
                if (nextProgress.terminal) break;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            if (!progress?.terminal) throw new Error(BATCH_CLIENT_MESSAGES.translateTimedOut);
            const persistCancelState = await settleBatchPreTranslateCancel(batchId);
            showBatchPreTranslateCancelFailure();
            if (!canPersistBatchPreTranslateResults(progress, persistCancelState)) {
                if (!isBatchPreTranslateCancelConfirmed(persistCancelState)) {
                    throw new Error(BATCH_CLIENT_MESSAGES.preTranslateCancelPending);
                }
                throw new Error('批量预译已取消');
            }

            const persistResponse = await fetch('/api/batch-pre-translate/persist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ batchId }),
            });
            const persisted = await persistResponse.json().catch(() => ({}));
            if (!persistResponse.ok || persisted?.complete === false) {
                throw new Error(BATCH_CLIENT_MESSAGES.preTranslatePersistFailed);
            }

            const updatedIds = new Set<string>((persisted?.updatedIds || []).map(String));
            for (const item of notStartedItems.filter(candidate =>
                updatedIds.has(String(candidate.id))
            )) {
                const mtEvent = await recordGoToNextTranslationProcessEventAction(
                    item.id,
                    'MT',
                    'AGENT',
                    'SUCCESS'
                );
                const reviewEvent = await recordGoToNextTranslationProcessEventAction(
                    item.id,
                    'MT_REVIEW',
                    'USER',
                    'STARTED'
                );
                if (!mtEvent.success || !reviewEvent.success) {
                    logger.warn(`分段 ${item.id} 的预译审计事件未完整保存`);
                }
            }

            if ((persisted?.failedIds || []).length || Number(progress.failed || 0) > 0) {
                toast.warning(
                    `批量翻译已保存 ${updatedIds.size} 个分段；${(persisted?.failedIds || []).length || progress.failed || 0} 个未完成`
                );
            } else {
                toast.success(`批量翻译完成：安全保存 ${updatedIds.size} 个分段，等待人工复核`);
            }

            const tabsResponse = await fetch(
                `/api/explorer-tabs?projectId=${encodeURIComponent((explorerTabs as any)?.projectId || '')}`
            );
            if (tabsResponse.ok) setExplorerTabs(await tabsResponse.json());
        } catch (e) {
            if (isBatchPreTranslateCancelConfirmed(batchPreTranslateCancelStateRef.current)) {
                toast.info('批量翻译已取消；未保存的任务结果不会写入分段');
            } else {
                logger.error('批量翻译启动或轮询失败:', e);
                toast.error(
                    resolveBatchClientErrorMessage(e, BATCH_CLIENT_MESSAGES.translateFailed)
                );
            }
        } finally {
            setIsRunning(false);
            setCurrentOperation('idle');
            setBatchOpen(false);
            if (startedBatchId) setBatchJobId(undefined);
            batchCancelRef.current = false;
            finishBatchPreTranslateFlow();
        }
    };

    const evaluateCurrentTranslation = async (provider: string = 'openai') => {
        let operationItemId = '';
        let qaClaimed = false;
        try {
            // 检查前置条件
            const id = String((activeDocumentItem as any)?.id || '');
            if (!id) {
                toast.error('没有激活的文档项，无法进行质检');
                return;
            }
            operationItemId = id;
            if (contentItemId !== id) {
                toast.info('当前分段仍在加载，请加载完成后再启动质检');
                return;
            }
            let currentItemStatus = activeDocumentItem?.status;
            // 从 explorerTabs 中查找最新的状态
            const tabs = explorerTabs?.documentTabs ?? [];
            for (const tab of tabs) {
                const item = (tab.items ?? []).find((it: any) => it.id === id);
                if (item) {
                    currentItemStatus = item.status;
                    break;
                }
            }
            // 检查当前状态是否允许质检（应该在 MT_REVIEW 状态）
            if (currentItemStatus !== 'MT_REVIEW') {
                toast.error(
                    `当前分段状态为 ${currentItemStatus || '未知'}，无法进行质检。仅在预翻译复核阶段允许质检`
                );
                return;
            }

            // 检查文本内容
            const currentSourceText = sourceText;
            const preTranslation = preTranslateEmbedded as string | undefined;
            const currentTargetText = targetText || preTranslation || '';
            const isCurrentItem = () =>
                activeItemIdRef.current === id &&
                sourceTextRef.current === currentSourceText &&
                qaTargetTextRef.current === currentTargetText;

            if (!currentSourceText.trim()) {
                toast.error('原文内容为空，无法进行质检');
                return;
            }

            if (!currentTargetText.trim()) {
                toast.error('译文内容为空，无法进行质检。请先完成预翻译');
                return;
            }

            setIsRunning(true);
            setCurrentOperation('evaluate_single');
            // 记录开始质检
            logAgent(
                `开始翻译质检，原文长度: ${currentSourceText.length}字符，译文长度: ${currentTargetText.length}字符`
            );

            // 质检只产生待复核的结构关系和风险；译文修改由用户勾选后触发。
            let result: Awaited<ReturnType<typeof runQualityAssureAction>>;
            let qaRunId = '';
            try {
                // Claim QA before invoking the model. Unlike the generic
                // status action, this exact MT_REVIEW -> QA CAS cannot be
                // repeated by a stale browser tab.
                const claimed = await startQualityAssureAction(
                    id,
                    currentSourceText,
                    currentTargetText
                );
                qaRunId = String((claimed as any)?.qaRunId || '').trim();
                if (!qaRunId) {
                    throw new Error('质检运行标识缺失，请刷新后重试');
                }
                qaClaimed = true;
                syncLocalStatusById(id, 'QA');
                if (isCurrentItem()) setCurrentStage('QA' as any);
                setQARunning(true);
                setQAStep('bi-term-eval');

                result = await runQualityAssureAction(
                    currentSourceText || '',
                    currentTargetText || '',
                    {
                        targetLanguage,
                        domain: undefined,
                        projectId: undefined,
                        locale: locale,
                    }
                );
                if (!isCurrentItem()) {
                    throw new Error('当前分段已切换，已丢弃过期质检结果');
                }
                setQAStep('syntax-eval');
            } finally {
                setQARunning(false);
                setQAStep('idle');
            }

            await saveQualityAssureResultsAction(
                id,
                {
                    biTerm: result.biTerm,
                    syntax: result.syntax,
                    syntaxEmbedded: null,
                },
                {
                    sourceText: currentSourceText,
                    targetText: currentTargetText,
                    qaRunId,
                }
            );
            if (isCurrentItem()) {
                setQAOutputs({
                    itemId: id,
                    biTerm: result.biTerm,
                    syntax: result.syntax,
                });
                setQASyntaxEmbedded(undefined);
            }
            logInfo('质检结果已保存到数据库');

            // The server verifies the run token and durable result before it
            // promotes QA to review. Timeline writes remain best-effort.
            // 时间线事件失败只记录告警，不能把已经成功的质检标成失败。
            try {
                await completeQualityAssureAction(id, qaRunId);

                syncLocalStatusById(id, 'QA_REVIEW');

                if (isCurrentItem()) setCurrentStage('QA_REVIEW' as any);

                logInfo(`分段 ${id} 质检完成，状态更新为 QA_REVIEW`);
            } catch (error) {
                logError('质检状态更新失败，请刷新确认分段状态');
                throw error;
            }
            try {
                await recordGoToNextTranslationProcessEventAction(id, 'QA', 'AGENT', 'SUCCESS');
                await recordGoToNextTranslationProcessEventAction(
                    id,
                    'QA_REVIEW',
                    'USER',
                    'STARTED'
                );
            } catch (eventError) {
                logger.warn('质检已完成，但时间线事件记录失败:', eventError);
                logWarning('质检已完成，但时间线事件未记录');
            }

            // 更新目标编辑器与提示
            if (targetEditor?.editor) {
                toast.success('质检完成：翻译质检已完成，请复核质检结果');
                logInfo('翻译质检完成，等待复核');
            } else {
                toast.success('质检完成：翻译质检已完成');
            }
        } catch (error: any) {
            logger.error('质检失败:', error);
            // Once a strict claim succeeds, the server owns QA. Do not write
            // a compensating MT_REVIEW transition here: another tab may have
            // completed the run or be persisting the current result.

            const errorMessage = resolveSingleQaClientErrorMessage(error, qaClaimed);

            toast.error(errorMessage);
            logError(errorMessage);

            // 记录失败事件
            try {
                if (operationItemId) {
                    await recordGoToNextTranslationProcessEventAction(
                        operationItemId,
                        'QA',
                        'AGENT',
                        'FAILED'
                    );
                }
            } catch (e) {
                // 忽略事件记录失败
            }
        } finally {
            setIsRunning(false);
            setCurrentOperation('idle');
        }
    };

    const handleBatchEvaluate = async () => {
        let progress:
            | {
                  percent?: number;
                  done?: number;
                  failed?: number;
                  terminal?: boolean;
                  canceled?: boolean;
                  error?: string;
              }
            | undefined;
        try {
            setCurrentOperation('evaluate_batch');
            const tabs = explorerTabs?.documentTabs ?? [];

            // 只获取需要质检的分段：MT_REVIEW 状态（预翻译复核阶段）
            const needEvaluateItems: DocumentItemTab[] = tabs.flatMap(t =>
                (t.items ?? []).filter((item: any) => item.status === 'MT_REVIEW')
            );

            const total = needEvaluateItems.length;
            if (!total) {
                toast.error('没有需要质检的分段：所有分段都已质检或未处于预翻译复核阶段');
                return;
            }

            batchCancelRef.current = false;
            startBatchQAFlow();
            setIsRunning(true);
            setBatchProgress(0);
            setProgressTitle('批量质检中');
            setBatchOpen(true);

            const itemIds = needEvaluateItems.map(i => i.id);
            const startResponse = await fetch('/api/batch-quality-assure/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    itemIds,
                    targetLanguage: targetLanguage || 'auto',
                }),
            });
            const startQARes = await startResponse.json().catch(() => ({}));
            const { batchId } = startQARes || {};
            if (!startResponse.ok || !batchId) {
                throw new Error(BATCH_CLIENT_MESSAGES.qaStartFailed);
            }

            setBatchJobId(batchId);
            batchQAIdRef.current = batchId;
            const startCancelState = await settleBatchQACancel(batchId);
            showBatchQACancelFailure();
            if (isBatchQACancelConfirmed(startCancelState)) {
                throw new Error('批量质检已取消');
            }
            for (let tries = 0; tries < 600; tries += 1) {
                const cancelState = await settleBatchQACancel(batchId);
                showBatchQACancelFailure();
                if (isBatchQACancelConfirmed(cancelState)) {
                    throw new Error('批量质检已取消');
                }

                const progressResponse = await fetch(
                    `/api/batch-quality-assure/progress?batchId=${encodeURIComponent(batchId)}`
                );
                const nextProgress: NonNullable<typeof progress> = await progressResponse
                    .json()
                    .catch(() => ({}));
                progress = nextProgress;
                if (!progressResponse.ok) {
                    throw new Error(BATCH_CLIENT_MESSAGES.qaProgressFailed);
                }

                // Keep compatibility with an in-flight older server during a
                // rolling deploy, while the current server returns terminal.
                nextProgress.terminal =
                    nextProgress.terminal ?? Number(nextProgress.percent || 0) >= 100;
                setBatchProgress(Number(nextProgress.percent || 0));
                if (nextProgress.canceled) {
                    batchQACancelStateRef.current = 'confirmed';
                    throw new Error('批量质检已取消');
                }
                if (nextProgress.terminal) break;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            if (!progress?.terminal) throw new Error(BATCH_CLIENT_MESSAGES.qaTimedOut);
            const persistCancelState = await settleBatchQACancel(batchId);
            showBatchQACancelFailure();
            if (!canPersistBatchQAResults(progress, persistCancelState)) {
                if (!isBatchQACancelConfirmed(persistCancelState)) {
                    throw new Error(BATCH_CLIENT_MESSAGES.qaCancelPending);
                }
                throw new Error('批量质检已取消');
            }

            const persistResponse = await fetch('/api/batch-quality-assure/persist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ batchId }),
            });
            const persisted = await persistResponse.json().catch(() => ({}));
            if (!persistResponse.ok || persisted?.complete === false) {
                throw new Error(BATCH_CLIENT_MESSAGES.qaPersistFailed);
            }

            const updatedIds = new Set<string>((persisted?.updatedIds || []).map(String));
            for (const item of needEvaluateItems.filter(candidate =>
                updatedIds.has(String(candidate.id))
            )) {
                try {
                    await recordGoToNextTranslationProcessEventAction(
                        item.id,
                        'QA',
                        'AGENT',
                        'SUCCESS'
                    );
                    await recordGoToNextTranslationProcessEventAction(
                        item.id,
                        'QA_REVIEW',
                        'USER',
                        'STARTED'
                    );
                } catch (e) {
                    logger.error(`更新分段 ${item.id} 状态失败:`, e);
                }
            }

            if (updatedIds.has(String((activeDocumentItem as any)?.id || ''))) {
                setCurrentStage('QA_REVIEW' as any);
            }

            if ((progress.failed || 0) > 0 || updatedIds.size < (progress.done || 0)) {
                toast.warning(
                    `批量质检完成，但有失败项：已保存 ${updatedIds.size}，处理失败 ${progress.failed || 0}`
                );
            } else {
                toast.success(`批量质检完成：成功保存 ${updatedIds.size} 个预翻译复核分段`);
            }

            const tabsResponse = await fetch(
                `/api/explorer-tabs?projectId=${encodeURIComponent((explorerTabs as any)?.projectId || '')}`
            );
            if (tabsResponse.ok) setExplorerTabs(await tabsResponse.json());
        } catch (e) {
            if (isBatchQACancelConfirmed(batchQACancelStateRef.current)) {
                toast.info('批量质检已取消；未保存的结果不会写入分段');
            } else {
                logger.error('批量质检失败:', e);
                toast.error(resolveBatchClientErrorMessage(e, BATCH_CLIENT_MESSAGES.qaFailed));
            }
        } finally {
            setIsRunning(false);
            setBatchOpen(false);
            setCurrentOperation('idle');
            setBatchJobId(undefined);
            batchCancelRef.current = false;
            finishBatchQAFlow();
        }
    };

    // 提取批量签发逻辑，便于快捷键和菜单复用
    const batchSignoff = async () => {
        if (batchSignoffRunRef.current) return;
        const targetElement = targetEditor.editor?.view.dom;
        if (
            hasUnsavedPostEditDraft({
                activeItemId: activeDocumentItem.id,
                currentStage,
                editorItemId: targetElement?.getAttribute('data-deeptrans-editor-item-id'),
                editorJob: targetElement?.getAttribute('data-deeptrans-editor-job'),
                editorDirty: targetElement?.getAttribute('data-deeptrans-editor-dirty'),
            })
        ) {
            toast.error('当前译后复核分段有未保存译文。请先保存，或使用单项签发。');
            return;
        }
        batchSignoffRunRef.current = true;
        try {
            const tabs = explorerTabs?.documentTabs ?? [];
            const aid = (activeDocumentItem as any)?.id;
            const currentTab = tabs.find((t: any) =>
                (t.items ?? []).some((it: any) => it.id === aid)
            );
            const items: any[] = (currentTab?.items ?? []) as any[];
            if (!items.length) return;

            // 只处理 POST_EDIT_REVIEW 状态的分段
            const itemsToSignoff = items.filter((it: any) => it.status === 'POST_EDIT_REVIEW');
            const totalToSignoff = itemsToSignoff.length;

            if (totalToSignoff === 0) {
                toast.info('当前页签中没有需要签发的分段');
                return;
            }

            // A previous batch may have been canceled. Sign-off has no remote
            // queue to cancel, so this local token is the authority that stops
            // all not-yet-started writes in the sequential loop below.
            batchCancelRef.current = false;
            setBatchJobId(undefined);
            setProgressTitle('批量签发中');
            setBatchProgress(0);
            setBatchOpen(true);
            setIsRunning(true);
            setCurrentOperation('signoff_batch');

            let done = 0;
            let succeeded = 0;
            let failed = 0;
            const signedOffIds = new Set<string>();
            const sequence = await runCancelableSequence(
                itemsToSignoff,
                async it => {
                    try {
                        // This item is already in progress once the callback starts.
                        // Finish its paired status/audit operation before observing a
                        // cancellation for the next item, so no signed-off row is left
                        // without its required timeline event.
                        const content = await getContentByIdAction(it.id);
                        await signOffPostEditReviewAction(it.id, buildBatchSignoffInput(content));
                        const event = await recordGoToNextTranslationProcessEventAction(
                            it.id,
                            'SIGN_OFF',
                            'HUMAN',
                            'SUCCESS'
                        );
                        if (!event.success) {
                            // Signing off without an audit event would make the
                            // timeline claim a review that cannot be proven. Roll
                            // back the adjacent status before reporting failure.
                            await updateDocItemStatusAction(it.id, 'POST_EDIT_REVIEW');
                            throw new Error(event.error || '签发审计记录未保存');
                        }
                        signedOffIds.add(String(it.id));
                        succeeded += 1;
                    } catch (e) {
                        failed += 1;
                        logger.error(`签发分段 ${it.id} 失败:`, e);
                    } finally {
                        done += 1;
                        setBatchProgress(Math.round((done / totalToSignoff) * 100));
                    }
                },
                () => batchCancelRef.current
            );

            // 更新当前激活项（如果也在处理列表中）
            try {
                if ((activeDocumentItem as any)?.id) {
                    const currentItem = itemsToSignoff.find(
                        (it: any) =>
                            signedOffIds.has(String(it.id)) &&
                            it.id === (activeDocumentItem as any)?.id
                    );
                    if (currentItem) {
                        setCurrentStage('SIGN_OFF' as any);
                    }
                }
            } catch {}

            // 本地同步（只更新处理过的分段）
            setExplorerTabs((prev: any) => {
                if (!prev?.documentTabs) return prev;
                return {
                    ...prev,
                    documentTabs: prev.documentTabs.map((tab: any) => {
                        if (tab.id === currentTab?.id) {
                            return {
                                ...tab,
                                items: (tab.items ?? []).map((it: any) => {
                                    const shouldUpdate = signedOffIds.has(String(it.id));
                                    return shouldUpdate ? { ...it, status: 'SIGN_OFF' } : it;
                                }),
                            };
                        }
                        return tab;
                    }),
                };
            });

            if (sequence.canceled) {
                toast.info(
                    `批量签发已取消：已完成 ${succeeded} 个，失败 ${failed} 个，剩余 ${sequence.remaining} 个未处理`
                );
            } else if (!succeeded) {
                toast.error(`批量签发未完成：${failed} 个分段未能保存签发状态`);
            } else if (failed) {
                toast.warning(`批量签发完成：成功 ${succeeded} 个，失败 ${failed} 个`);
            } else {
                toast.success(`批量签发完成：成功处理 ${succeeded} 个分段`);
            }
        } catch (e) {
            logger.error('批量签发失败:', e);
            toast.error(resolveBatchClientErrorMessage(e, BATCH_CLIENT_MESSAGES.signoffFailed));
        } finally {
            setIsRunning(false);
            setCurrentOperation('idle');
            setBatchOpen(false);
            setBatchJobId(undefined);
            batchCancelRef.current = false;
            batchSignoffRunRef.current = false;
        }
    };

    // 自动推进；遇到 QA 人工复核边界时必须停下。
    const runToCompletionFromCurrent = async () => {
        try {
            const tabs = explorerTabs?.documentTabs ?? [];
            const aid = (activeDocumentItem as any)?.id;
            const currentTab = tabs.find((t: any) =>
                (t.items ?? []).some((it: any) => it.id === aid)
            );
            const items: any[] = (currentTab?.items ?? []) as any[];
            if (!items.length) {
                toast.error('没有可处理的分段：请先在左侧加载文档');
                return;
            }

            // 过滤出需要处理的分段：排除已完成状态
            const itemsToProcess = items.filter((it: any) => it.status !== 'COMPLETED');
            if (itemsToProcess.length === 0) {
                toast.info('所有分段已完成，无需处理');
                return;
            }

            const itemIds = itemsToProcess.map(i => i.id);
            let workflowItems = itemsToProcess;

            // A previous batch may have been canceled. Each new batch starts
            // with a fresh cancellation token instead of inheriting that flag.
            batchCancelRef.current = false;
            setIsRunning(true);
            setCurrentOperation('translate_batch');
            setProgressTitle('批量预译中');
            setBatchProgress(0);
            setBatchOpen(true);

            // 1) 批量预译 - 只处理未开始的分段
            const needPreTranslateItems = itemsToProcess.filter(
                (it: any) => it.status === 'NOT_STARTED' || !it.status
            );

            if (needPreTranslateItems.length > 0) {
                startBatchPreTranslateFlow();
                const preTranslateIds = needPreTranslateItems.map(i => i.id);
                try {
                    const startResponse = await fetch('/api/batch-pre-translate/start', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            itemIds: preTranslateIds,
                            sourceLanguage: sourceLanguage || 'auto',
                            targetLanguage: targetLanguage || 'auto',
                        }),
                    });
                    const startRes = await startResponse.json().catch(() => ({}));
                    const { batchId } = startRes || {};
                    if (!startResponse.ok || !batchId) {
                        throw new Error(BATCH_CLIENT_MESSAGES.translateStartFailed);
                    }
                    setBatchJobId(batchId);
                    batchPreTranslateIdRef.current = batchId;
                    const startCancelState = await settleBatchPreTranslateCancel(batchId);
                    showBatchPreTranslateCancelFailure();
                    if (isBatchPreTranslateCancelConfirmed(startCancelState)) {
                        throw new Error('批量预译已取消');
                    }
                    let terminal = false;
                    let preProgress:
                        | {
                              percent?: number;
                              terminal?: boolean;
                              canceled?: boolean;
                              error?: string;
                          }
                        | undefined;
                    for (let tries = 0; tries < 600; tries += 1) {
                        const cancelState = await settleBatchPreTranslateCancel(batchId);
                        showBatchPreTranslateCancelFailure();
                        if (isBatchPreTranslateCancelConfirmed(cancelState)) {
                            throw new Error('批量预译已取消');
                        }
                        const progressResponse = await fetch(
                            `/api/batch-pre-translate/progress?batchId=${encodeURIComponent(batchId)}`
                        );
                        const progress: NonNullable<typeof preProgress> = await progressResponse
                            .json()
                            .catch(() => ({}));
                        preProgress = progress;
                        if (!progressResponse.ok) {
                            throw new Error(BATCH_CLIENT_MESSAGES.translateProgressFailed);
                        }
                        progress.terminal =
                            progress.terminal ?? Number(progress?.percent || 0) >= 100;
                        if (progress.canceled) {
                            batchPreTranslateCancelStateRef.current = 'confirmed';
                            throw new Error('批量预译已取消');
                        }
                        setBatchProgress(
                            calculateOneClickWorkflowProgress({
                                preTranslateCount: needPreTranslateItems.length,
                                // Every pre-translated item becomes a QA unit. Existing
                                // MT_REVIEW items will be added after this stage refreshes.
                                qaCount:
                                    needPreTranslateItems.length +
                                    itemsToProcess.filter(
                                        (item: any) => item.status === 'MT_REVIEW'
                                    ).length,
                                stage: 'pre-translate',
                                stagePercent: Number(progress?.percent || 0),
                            })
                        );
                        if (progress?.terminal) {
                            terminal = true;
                            break;
                        }
                        await new Promise(res => setTimeout(res, 1000));
                    }
                    if (!terminal) throw new Error(BATCH_CLIENT_MESSAGES.translateTimedOut);
                    const persistCancelState = await settleBatchPreTranslateCancel(batchId);
                    showBatchPreTranslateCancelFailure();
                    if (!canPersistBatchPreTranslateResults(preProgress, persistCancelState)) {
                        if (!isBatchPreTranslateCancelConfirmed(persistCancelState)) {
                            throw new Error(BATCH_CLIENT_MESSAGES.preTranslateCancelPending);
                        }
                        throw new Error('批量预译已取消');
                    }
                    {
                        try {
                            const persistResponse = await fetch(
                                '/api/batch-pre-translate/persist',
                                {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ batchId }),
                                }
                            );
                            const payload = await persistResponse.json().catch(() => ({}));
                            if (!persistResponse.ok || payload?.complete === false) {
                                throw new Error(BATCH_CLIENT_MESSAGES.preTranslatePersistFailed);
                            }
                            if (Array.isArray(payload?.failedIds) && payload.failedIds.length) {
                                throw new Error(
                                    `有 ${payload.failedIds.length} 个分段未完成预译，请恢复或重试预译后再继续`
                                );
                            }

                            // QA candidates must come from the persisted state. The original
                            // snapshot still says NOT_STARTED and would otherwise skip every
                            // segment that was just pretranslated.
                            const refreshedResponse = await fetch(
                                `/api/explorer-tabs?projectId=${encodeURIComponent((explorerTabs as any)?.projectId || '')}`
                            );
                            if (!refreshedResponse.ok) {
                                throw new Error('无法刷新预译后的分段状态');
                            }
                            const refreshed = await refreshedResponse.json();
                            setExplorerTabs(refreshed);
                            const refreshedById = new Map(
                                (refreshed?.documentTabs || [])
                                    .flatMap((tab: any) => tab.items || [])
                                    .map((item: any) => [String(item.id), item])
                            );
                            workflowItems = itemIds
                                .map(id => refreshedById.get(String(id)))
                                .filter(Boolean) as any[];
                        } catch (error) {
                            logger.error('保存或刷新批量预译结果失败:', error);
                            throw error;
                        }
                    }
                    // The pre-translation batch is now durably complete. Any
                    // later cancel belongs to the next workflow phase, not its
                    // already persisted Redis namespace.
                    finishBatchPreTranslateFlow();
                } catch (error) {
                    if (
                        !isBatchPreTranslateCancelConfirmed(batchPreTranslateCancelStateRef.current)
                    ) {
                        logger.error('批量预译失败:', error);
                    }
                    throw error;
                }
            }

            // 2) Batch QA starts only after persisted MT review. A remaining
            // MT means pre-translation was interrupted or has not reached its
            // review boundary; do not skip it and then claim QA completion.
            const { reviewReadyItems: needQaItems, unfinishedMtItems } =
                partitionBatchQAWorkflowItems(workflowItems);
            if (unfinishedMtItems.length > 0) {
                throw new Error(
                    `有 ${unfinishedMtItems.length} 个分段仍停留在预译阶段，请恢复或重试预译后再启动批量质检`
                );
            }

            if (needQaItems.length > 0) {
                startBatchQAFlow();
                setCurrentOperation('evaluate_batch');
                setProgressTitle('批量评估中');
                const qaIds = needQaItems.map(i => i.id);
                try {
                    const startQAResponse = await fetch('/api/batch-quality-assure/start', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            itemIds: qaIds,
                            targetLanguage: targetLanguage || 'auto',
                        }),
                    });
                    const startQARes = await startQAResponse.json().catch(() => ({}));
                    const { batchId } = startQARes || {};
                    if (!startQAResponse.ok || !batchId) {
                        throw new Error(BATCH_CLIENT_MESSAGES.qaStartFailed);
                    }
                    setBatchJobId(batchId);
                    batchQAIdRef.current = batchId;
                    const startCancelState = await settleBatchQACancel(batchId);
                    showBatchQACancelFailure();
                    if (isBatchQACancelConfirmed(startCancelState)) {
                        throw new Error('批量质检已取消');
                    }
                    let qaTerminal = false;
                    let qaProgress:
                        | {
                              percent?: number;
                              terminal?: boolean;
                              canceled?: boolean;
                              error?: string;
                          }
                        | undefined;
                    for (let tries = 0; tries < 600; tries += 1) {
                        const cancelState = await settleBatchQACancel(batchId);
                        showBatchQACancelFailure();
                        if (isBatchQACancelConfirmed(cancelState)) {
                            throw new Error('批量质检已取消');
                        }
                        const progressResponse = await fetch(
                            `/api/batch-quality-assure/progress?batchId=${encodeURIComponent(batchId)}`
                        );
                        const progress = await progressResponse.json().catch(() => ({}));
                        if (!progressResponse.ok) {
                            throw new Error(BATCH_CLIENT_MESSAGES.qaProgressFailed);
                        }
                        const nextQAProgress: NonNullable<typeof qaProgress> = {
                            ...progress,
                            terminal: progress?.terminal ?? Number(progress?.percent || 0) >= 100,
                        };
                        qaProgress = nextQAProgress;
                        if (nextQAProgress.canceled) {
                            batchQACancelStateRef.current = 'confirmed';
                            throw new Error('批量质检已取消');
                        }
                        setBatchProgress(
                            calculateOneClickWorkflowProgress({
                                preTranslateCount: needPreTranslateItems.length,
                                qaCount: needQaItems.length,
                                stage: 'quality-assure',
                                stagePercent: Number(nextQAProgress.percent || 0),
                            })
                        );
                        if (nextQAProgress.terminal) {
                            qaTerminal = true;
                            break;
                        }
                        await new Promise(res => setTimeout(res, 1000));
                    }
                    if (!qaTerminal) throw new Error(BATCH_CLIENT_MESSAGES.qaTimedOut);
                    const persistCancelState = await settleBatchQACancel(batchId);
                    showBatchQACancelFailure();
                    if (!canPersistBatchQAResults(qaProgress, persistCancelState)) {
                        if (!isBatchQACancelConfirmed(persistCancelState)) {
                            throw new Error(BATCH_CLIENT_MESSAGES.qaCancelPending);
                        }
                        throw new Error('批量质检已取消');
                    }
                    {
                        try {
                            const persistResponse = await fetch(
                                '/api/batch-quality-assure/persist',
                                {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ batchId }),
                                }
                            );
                            const payload = await persistResponse.json().catch(() => ({}));
                            if (!persistResponse.ok) {
                                throw new Error(BATCH_CLIENT_MESSAGES.qaPersistFailed);
                            }
                            if (payload?.complete === false) {
                                throw new Error('部分质检结果暂未保存，请重试保存');
                            }
                            if (Array.isArray(payload?.failedIds) && payload.failedIds.length) {
                                toast.warning(
                                    `有 ${payload.failedIds.length} 个分段未完成质检，请单独重试`
                                );
                            }
                        } catch (error) {
                            logger.error('保存批量质检结果失败:', error);
                            throw error;
                        }
                    }
                } catch (error) {
                    logger.error('批量评估失败:', error);
                    throw error;
                }
            }

            // The automation boundary is intentional: a user must review QA,
            // choose whether to apply a revision, and approve post-edit/signoff.
            // Never synthesize those stages just to make a run look complete.
            setBatchOpen(false);
            const refreshedResponse = await fetch(
                `/api/explorer-tabs?projectId=${encodeURIComponent((explorerTabs as any)?.projectId || '')}`
            );
            if (!refreshedResponse.ok) throw new Error('无法刷新自动流程后的分段状态');
            const refreshed = await refreshedResponse.json();
            const refreshedItems = (refreshed?.documentTabs || []).flatMap(
                (tab: any) => tab.items || []
            );
            if (
                needQaItems.length > 0 &&
                !refreshedItems.some(
                    (item: any) =>
                        needQaItems.some(candidate => String(candidate.id) === String(item.id)) &&
                        item.status === 'QA_REVIEW'
                )
            ) {
                throw new Error('质检未产生可复核结果，无法宣告自动流程已到人工复核');
            }
            setExplorerTabs(refreshed);
            const refreshedActive = refreshedItems.find((item: any) => item.id === aid);
            if (refreshedActive?.status) setCurrentStage(refreshedActive.status as any);
            toast.info('自动流程已停在质检复核；后续译后编辑、签发与完成需经人工确认。');
        } catch (e) {
            if (
                batchCancelRef.current ||
                isBatchQACancelConfirmed(batchQACancelStateRef.current) ||
                isBatchPreTranslateCancelConfirmed(batchPreTranslateCancelStateRef.current)
            ) {
                toast.info('自动流程已取消；未保存的批处理结果不会写入分段');
            } else {
                logger.error('自动流程失败:', e);
                toast.error(
                    resolveBatchClientErrorMessage(e, BATCH_CLIENT_MESSAGES.workflowFailed)
                );
            }
        } finally {
            setIsRunning(false);
            setCurrentOperation('idle');
            setBatchOpen(false);
            setBatchJobId(undefined);
            batchCancelRef.current = false;
            finishBatchPreTranslateFlow();
            finishBatchQAFlow();
        }
    };

    /**
     * The menu and the stage badge must never disagree about what “post-edit
     * completed” means.  This helper owns the real query → evaluate → rewrite
     * pipeline and persists its output before recording a SUCCESS event.
     */
    const executePostEditForItem = async ({
        itemId,
        source,
        target,
    }: {
        itemId: string;
        source: string;
        target: string;
    }) => {
        let enteredPostEdit = false;
        let outcomePhase: PostEditOutcomePhase = 'query';
        const isCurrentItem = () =>
            activeItemIdRef.current === itemId &&
            sourceTextRef.current === source &&
            targetTextRef.current === target;

        try {
            // The transition itself verifies that the preceding QA result is
            // complete and still matches the document item.
            await updateDocItemStatusAction(itemId, 'POST_EDIT');
            enteredPostEdit = true;
            syncLocalStatusById(itemId, 'POST_EDIT');
            if (isCurrentItem()) setCurrentStage('POST_EDIT' as any);

            const started = await recordGoToNextTranslationProcessEventAction(
                itemId,
                'POST_EDIT',
                'AGENT',
                'STARTED'
            );
            if (!started.success) {
                logger.warn('译后编辑已启动，但开始事件未记录');
            }

            logInfo(`分段 ${itemId} 开始语篇查询、评估与改写`);
            // The menu path uses the same persisted workflow result as the
            // stage badge. Publish a scoped loading state before the work
            // starts so the post-edit panel cannot restore stale data over
            // this run, then publish only the saved result below.
            if (isCurrentItem()) {
                setPERunning(true);
                setPeStep('discourse-query');
                setPosteditOutputs(undefined);
                setPosteditOutcome({ itemId, status: 'loading', phase: 'query' });
            }

            const result = await runPostEditAction(source, target, { documentItemId: itemId });
            if (!result.success) {
                outcomePhase = result.phase;
                throw new Error(result.error);
            }

            outcomePhase = 'persist';
            await savePostEditResultsAction(
                itemId,
                {
                    query: result.query.hits,
                    evaluation: result.evaluation,
                    rewrite: result.rewrite,
                },
                { sourceText: source, targetText: target }
            );

            // `savePostEditResultsAction` is the durability boundary. The
            // panel must show this current segment's result immediately after
            // it crosses that boundary rather than waiting for a segment
            // switch or a full refresh to restore it from the database.
            if (isCurrentItem()) {
                setPosteditOutputs({
                    itemId,
                    memos: result.query.hits,
                    discourse: result.evaluation,
                    result: result.rewrite,
                });
                setPosteditOutcome(completePostEditOutcome(itemId, result.query.hits));
                setPeStep('done');
            }

            // A rewrite is a persisted proposal until the reviewer explicitly
            // applies it.  Do not silently replace the source-of-truth target
            // text with an asynchronous result.
            const succeeded = await recordGoToNextTranslationProcessEventAction(
                itemId,
                'POST_EDIT',
                'AGENT',
                'SUCCESS'
            );
            if (!succeeded.success) {
                logger.warn('译后编辑完成，但成功事件未记录');
            }
            return result;
        } catch (error) {
            if (enteredPostEdit) {
                try {
                    await updateDocItemStatusAction(itemId, 'QA_REVIEW');
                    syncLocalStatusById(itemId, 'QA_REVIEW');
                    if (isCurrentItem()) setCurrentStage('QA_REVIEW' as any);
                } catch {
                    logger.error('译后编辑失败后的状态回退失败');
                }
            }
            if (isCurrentItem()) {
                const failure = failedPostEditOutcome(
                    itemId,
                    outcomePhase,
                    error,
                    '译后编辑未完成，请重试。'
                );
                setPosteditOutcome(failure);
                setPeStep('idle');
            }
            await recordGoToNextTranslationProcessEventAction(
                itemId,
                'POST_EDIT',
                'AGENT',
                'FAILED'
            );
            throw error;
        } finally {
            if (isCurrentItem()) setPERunning(false);
        }
    };

    const handleSinglePostEdit = async () => {
        const itemId = String((activeDocumentItem as any)?.id || '');
        const currentStatus = String(
            (explorerTabs?.documentTabs ?? [])
                .flatMap(tab => tab.items ?? [])
                .find((item: any) => String(item.id) === itemId)?.status ||
                (activeDocumentItem as any)?.status ||
                ''
        );
        const inputSource = String(sourceText || '');
        const inputTarget = String(targetText || '');

        if (!itemId) {
            toast.error('没有激活的文档项');
            return;
        }
        if (contentItemId !== itemId) {
            toast.info('当前分段仍在加载，请加载完成后再启动译后编辑');
            return;
        }
        if (currentStatus !== 'QA_REVIEW') {
            toast.error('仅完成质检复核的分段可以启动译后编辑');
            return;
        }
        if (!inputSource.trim() || !inputTarget.trim()) {
            toast.error('原文或译文为空，无法启动译后编辑');
            return;
        }

        setCurrentOperation('post_edit_single');
        setIsRunning(true);
        try {
            const result = await executePostEditForItem({
                itemId,
                source: inputSource,
                target: inputTarget,
            });
            toast.success(
                `译后编辑完成：已保存 ${result.query.hits.length} 条语篇参考和改写建议，等待复核应用`
            );
        } catch (error) {
            logger.error('译后编辑失败:', error);
            logError(BATCH_CLIENT_MESSAGES.postEditFailed);
            toast.error(
                resolveBatchClientErrorMessage(error, BATCH_CLIENT_MESSAGES.postEditFailed)
            );
        } finally {
            setIsRunning(false);
            setCurrentOperation('idle');
        }
    };

    const handleBatchPostEdit = async () => {
        try {
            const tabs = explorerTabs?.documentTabs ?? [];
            const needPostEditItems: DocumentItemTab[] = tabs.flatMap(t =>
                (t.items ?? []).filter((item: any) => item.status === 'QA_REVIEW')
            );
            const total = needPostEditItems.length;
            if (!total) {
                toast.error('没有处于质检复核阶段、可执行译后编辑的分段');
                return;
            }

            setIsRunning(true);
            setCurrentOperation('post_edit_batch');
            setProgressTitle('批量译后编辑中');
            setBatchProgress(0);
            setBatchOpen(true);
            batchCancelRef.current = false;
            logInfo(`批量译后编辑开始：共 ${total} 个分段`);

            let done = 0;
            let succeeded = 0;
            let failed = 0;
            for (const item of needPostEditItems) {
                if (batchCancelRef.current) break;
                try {
                    const content = await getContentByIdAction(item.id);
                    const source = String(content?.sourceText || '');
                    const target = String(content?.targetText || '');
                    if (!source.trim() || !target.trim()) {
                        throw new Error('原文或译文为空');
                    }
                    await executePostEditForItem({ itemId: item.id, source, target });
                    succeeded += 1;
                } catch (error) {
                    failed += 1;
                    logger.error(`批量译后编辑分段 ${item.id} 失败:`, error);
                } finally {
                    done += 1;
                    setBatchProgress(Math.round((done / total) * 100));
                }
            }

            try {
                const tabsRes = await fetch(
                    `/api/explorer-tabs?projectId=${encodeURIComponent((explorerTabs as any)?.projectId || '')}`
                ).then(r => r.json());
                setExplorerTabs(tabsRes);
            } catch {}

            setBatchOpen(false);
            if (batchCancelRef.current) {
                toast.info(`批量译后编辑已取消：已完成 ${done} 个分段，成功 ${succeeded} 个`);
            } else if (failed) {
                toast.warning(`批量译后编辑完成：成功 ${succeeded} 个，失败 ${failed} 个`);
            } else {
                toast.success(`批量译后编辑完成：成功处理 ${succeeded} 个分段`);
            }
        } catch (error) {
            logger.error('批量译后编辑失败:', error);
            toast.error(
                resolveBatchClientErrorMessage(error, BATCH_CLIENT_MESSAGES.batchPostEditFailed)
            );
        } finally {
            setIsRunning(false);
            setCurrentOperation('idle');
        }
    };

    // 全局快捷键：⌘B 批量预译；⌘E 批量评估；⌘⇧S 批量签发
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (!shouldHandleIDEGlobalShortcut(e, isRunning)) return;
            const key = normalizeKeyboardKey(e.key);
            // ⌘B
            if (key === 'b') {
                e.preventDefault();
                handleBatchTranslate();
                return;
            }
            // ⌘E
            if (key === 'e') {
                e.preventDefault();
                handleBatchEvaluate();
                return;
            }
            // ⌘P
            if (key === 'p') {
                e.preventDefault();
                void handleBatchPostEdit();
                return;
            }
            // ⌘⇧S
            if (e.shiftKey && key === 's') {
                e.preventDefault();
                batchSignoff();
                return;
            }
            // ⌘/
            if (key === '/') {
                e.preventDefault();
                setShortcutsOpen(true);
                return;
            }
            // ⌘,
            if (key === ',') {
                e.preventDefault();
                setPreferencesOpen(true);
                return;
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isRunning, handleBatchTranslate /* stable deps */]);

    const handleEvaluateMode = (modeSel: 'single' | 'batch') => {
        if (modeSel === 'single') return evaluateCurrentTranslation(chosenProvider);
        return handleBatchEvaluate();
    };

    if (!mounted) {
        return null;
    }

    return (
        <div className="w-full">
            <div className="flex w-full items-center justify-start">
                <RunMenu
                    isRunning={isRunning}
                    currentStage={currentStage}
                    onTranslationAction={() => runToCompletionFromCurrent()}
                    mounted={mounted}
                />
                <TranslateMenu
                    isTranslating={
                        isRunning &&
                        (currentOperation === 'translate_single' ||
                            currentOperation === 'translate_batch')
                    }
                    canTranslate={(explorerTabs?.documentTabs ?? [])
                        .flatMap(t => t.items ?? [])
                        .some((it: any) => it.status === 'NOT_STARTED')}
                    onTranslate={handlePreTranslationAction}
                    onBatchTranslate={handleBatchTranslate}
                    progressPercent={batchProgress}
                />
                <QualityMenu
                    isTranslating={
                        isRunning &&
                        (currentOperation === 'evaluate_single' ||
                            currentOperation === 'evaluate_batch')
                    }
                    canQuality={(explorerTabs?.documentTabs ?? [])
                        .flatMap(t => t.items ?? [])
                        .some((it: any) => it.status === 'MT_REVIEW')}
                    onEvaluate={handleEvaluateMode}
                    progressPercent={batchProgress}
                />
                <PostEditMenu
                    isTranslating={
                        isRunning &&
                        (currentOperation === 'post_edit_single' ||
                            currentOperation === 'post_edit_batch' ||
                            currentStage === 'POST_EDIT')
                    }
                    // 仅当至少有一个 QA_REVIEW 分段时开放；单例入口还会
                    // 校验当前激活分段，避免误把其他分段的可用性当作当前可用。
                    canEnter={(explorerTabs?.documentTabs ?? [])
                        .flatMap(t => t.items ?? [])
                        .some((it: any) => it.status === 'QA_REVIEW')}
                    onMarkReviewed={handleSinglePostEdit}
                    onBatchPostEdit={handleBatchPostEdit}
                />
            </div>
            <BatchProgressDialog
                open={batchOpen}
                onOpenChange={setBatchOpen}
                jobId={batchJobId}
                percent={batchProgress}
                onCancel={async () => {
                    const id = batchJobId;
                    const qaId = batchQAIdRef.current ?? (id?.startsWith('qa.') ? id : undefined);
                    if (batchQAActiveRef.current || qaId) {
                        // Keep a queued/requesting intent separate from a
                        // confirmed cancellation. While Redis decides the
                        // cancel-vs-persist race, the dialog stays open and
                        // both QA flows fence their persist calls.
                        // Always enqueue first; settleBatchQACancel owns the
                        // only transition that actually dispatches the API.
                        batchQACancelStateRef.current = beginBatchQACancel(
                            batchQACancelStateRef.current,
                            false
                        );
                        if (!qaId) return;

                        const cancelState = await settleBatchQACancel(qaId);
                        showBatchQACancelFailure();
                        if (isBatchQACancelConfirmed(cancelState)) {
                            setBatchOpen(false);
                            setBatchJobId(undefined);
                        }
                        return;
                    }

                    const preTranslateId =
                        batchPreTranslateIdRef.current ?? (id?.startsWith('bt.') ? id : undefined);
                    if (batchPreTranslateActiveRef.current || preTranslateId) {
                        // Do not close or announce cancellation until the
                        // server accepts the cancel-vs-persist race. A queued
                        // intent also covers a click while /start is in flight.
                        batchPreTranslateCancelStateRef.current = beginBatchPreTranslateCancel(
                            batchPreTranslateCancelStateRef.current,
                            false
                        );
                        if (!preTranslateId) return;

                        const cancelState = await settleBatchPreTranslateCancel(preTranslateId);
                        showBatchPreTranslateCancelFailure();
                        if (isBatchPreTranslateCancelConfirmed(cancelState)) {
                            setBatchOpen(false);
                            setBatchJobId(undefined);
                        }
                        return;
                    }

                    try {
                        setBatchOpen(false);
                        batchCancelRef.current = true;
                        setBatchJobId(undefined);
                    } catch {}
                }}
                title={progressTitle || '批量处理中'}
            />
            <KeyboardShortcutsDialog
                open={shortcutsOpen}
                onOpenChange={setShortcutsOpen}
                items={shortcuts}
            />
            <PreferencesDialog open={preferencesOpen} onOpenChange={setPreferencesOpen} />
        </div>
    );
}
