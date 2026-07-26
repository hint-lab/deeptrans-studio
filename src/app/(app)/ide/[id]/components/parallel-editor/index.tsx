'use client';
import {
    getDocumentItemIntermediateResultsAction,
    savePostEditResultsAction,
    savePreTranslateResultsAction,
    saveQualityAssureResultsAction,
} from '@/actions/intermediate-results';
import {
    embedDiscourseAction,
    evaluateDiscourseAction,
    queryDiscourseAction,
} from '@/actions/postedit';
import {
    baselineTranslateAction,
    embedAndTranslateAction,
    extractMonolingualTermsAction,
    lookupDictionaryAction,
} from '@/actions/pre-translate';
import { runQualityAssureAction } from '@/actions/quality-assure';
import { recordGoToNextTranslationProcessEventAction } from '@/actions/translation-process-event';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useActiveDocumentItem } from '@/hooks/useActiveDocumentItem';
import { useAgentWorkflowSteps } from '@/hooks/useAgentWorkflowSteps';
import { useBottomPanel } from '@/hooks/useBottomPanel';
import { useExplorerTabs } from '@/hooks/useExplorerTabs';
import { getTargetEditorInstance } from '@/hooks/useEditor';
import { useLogger } from '@/hooks/useLogger';
import { useRunningState } from '@/hooks/useRunning';
import {
    useTranslationContent,
    useTranslationLanguage,
    useTranslationState,
} from '@/hooks/useTranslation';
import { createLogger } from '@/lib/logger';
import {
    completePostEditOutcome,
    failedPostEditOutcome,
    type PostEditOutcomePhase,
} from '@/lib/post-edit-query-outcome';
import {
    canLeaveCurrentPostEditDraft,
    POST_EDIT_DRAFT_DISCARD_MESSAGE,
} from '@/lib/post-edit-draft-navigation';
import { getStageWorkbenchKind } from '@/lib/stage-workbench';
import { cn } from '@/lib/utils';
import type { TranslationStage } from '@/store/features/translationSlice';
import {
    ChevronLeft,
    ChevronRight,
    Columns,
    PanelBottomClose,
    PanelBottomOpen,
    Rows,
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useLocale, useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getContentByIdAction } from 'src/actions/document-item'; // 假设已创建数据获取方法
import Hello from './hello-page';
import RichTextEditor from './rich-text/editor';
import StageBadgeBar from './stage-badge';
import { TranslationProcessPanel } from './translation-process-panel';
const logger = createLogger(
    {
        type: 'ide:parallel-editor',
    },
    {
        json: false, // 开启json格式输出
        pretty: false, // 关闭开发环境美化输出
        colors: true, // 仅当json：false时启用颜色输出可用
        includeCaller: false, // 日志不包含调用者
    }
);

function TranslationPendingPlaceholder({ label }: { label: string }) {
    const rows = ['w-11/12', 'w-4/5', 'w-2/3'];

    return (
        <div className="min-h-[220px] px-5 py-4" aria-live="polite" aria-busy="true">
            <div className="mb-5 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-500 opacity-50" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500" />
                </span>
                <span>{label}</span>
            </div>
            <div className="space-y-4">
                {rows.map((width, index) => (
                    <div
                        key={width}
                        className={cn(
                            'h-4 animate-pulse rounded-sm bg-foreground/10 opacity-60',
                            width
                        )}
                        style={{ animationDelay: `${index * 180}ms` }}
                    />
                ))}
                <div className="flex items-center gap-1 pt-1">
                    <span className="h-4 w-[1.5px] animate-pulse rounded-full bg-indigo-500" />
                    <span className="h-4 w-24 rounded-sm bg-foreground/5" />
                </div>
            </div>
        </div>
    );
}

export default function ParallelEditor({ className }: { className?: string }) {
    const t = useTranslations('IDE.parallelEditor');
    const rightSidebarT = useTranslations('IDE.rightSidebar');
    const locale = useLocale();
    const {
        contentItemId,
        sourceText,
        targetText,
        clearTranslationContent,
        setTranslationContent,
        setTargetTranslationText,
    } = useTranslationContent();
    const [error, setError] = useState<string | null>(null);
    const { activeDocumentItem, setActiveDocumentItem } = useActiveDocumentItem();
    const { isBottomPanelOpen, toggleBottomPanel, setBottomPanelOpen } = useBottomPanel();
    const { currentStage, setCurrentStage } = useTranslationState();
    const [workflowOpen, setWorkflowOpen] = useState(false);
    const { sourceLanguage, targetLanguage } = useTranslationLanguage();
    const [stackLayout, setStackLayout] = useState<'vertical' | 'horizontal'>('vertical');
    const { explorerTabs } = useExplorerTabs();
    const { isRunning } = useRunningState();
    const { logSystem, logAgent, logInfo } = useLogger();
    const {
        setPreOutputs,
        setQAOutputs,
        setQASyntaxEmbedded,
        setPosteditOutputs,
        setPosteditOutcome,
        clearPosteditOutcome,
        setPreStep,
        setQAStep,
        setPeStep,
        setPreRunning,
        setQARunning,
        setPERunning,
        preTermEnabled,
    } = useAgentWorkflowSteps();
    const params = useParams();
    const projectId = Array.isArray(params?.id) ? params.id[0] : params?.id;
    const { data: session } = useSession();
    const userId = session?.user?.id;
    const [sourceLoading, setSourceLoading] = useState<boolean>(false);
    const contentLoadRef = useRef(0);
    const baselineRequestRef = useRef(0);
    const postEditRequestRef = useRef(0);
    const activeItemIdRef = useRef(String(activeDocumentItem?.id || ''));
    const sourceTextRef = useRef(String(sourceText || ''));
    const targetTextRef = useRef(String(targetText || ''));
    const currentStageRef = useRef(currentStage);
    const panelStageRef = useRef<{ itemId: string; stage: TranslationStage } | null>(null);
    activeItemIdRef.current = String(activeDocumentItem?.id || '');
    sourceTextRef.current = String(sourceText || '');
    targetTextRef.current = String(targetText || '');
    currentStageRef.current = currentStage;

    // Keep the lower workbench closed initially, but do not close it again
    // when the user explicitly opens a workflow/Prompt view during an
    // automatic stage. Review still opens it as a useful default.
    useEffect(() => {
        const itemId = String(activeDocumentItem?.id || '');
        if (!itemId) {
            panelStageRef.current = null;
            return;
        }

        const previous = panelStageRef.current;
        const stageChanged = previous?.itemId !== itemId || previous.stage !== currentStage;
        if (!stageChanged) return;

        const isAutomatic = getStageWorkbenchKind(currentStage) === 'automatic';
        const previousWasAutomatic =
            !previous || getStageWorkbenchKind(previous.stage) === 'automatic';

        if (!isAutomatic && previousWasAutomatic) {
            setBottomPanelOpen(true);
        }

        panelStageRef.current = { itemId, stage: currentStage };
    }, [activeDocumentItem?.id, currentStage, setBottomPanelOpen]);

    const runTranslate = async (
        options: {
            expectedSourceText?: string;
            expectedTargetText?: string;
            preTranslateRunId?: string;
        } = {}
    ) => {
        if (!activeDocumentItem?.id) return;
        const itemId = String(activeDocumentItem.id);
        if (contentItemId !== itemId || sourceLoading) {
            toast.error('当前分段仍在加载，请加载完成后再启动预翻译');
            throw new Error('当前分段内容尚未加载完成');
        }
        // A generated baseline is only a provisional preview. Once formal MT
        // starts, any late baseline response must no longer be allowed to write.
        baselineRequestRef.current += 1;
        const inputText = String(options.expectedSourceText ?? sourceText ?? '');
        // The formal start action has already claimed this exact source/run on
        // the server. Do not require React's source snapshot to have rendered
        // before the result can update the still-visible segment: a one-click
        // source save and start intentionally runs before that render.
        const isCurrentItem = () => activeItemIdRef.current === itemId;
        try {
            logAgent('MT');
            setPreRunning(true);

            // 记录 MT 阶段开始
            await recordGoToNextTranslationProcessEventAction(itemId, 'MT', 'AGENT', 'STARTED');

            // 执行真实的workflow步骤
            setPreStep('mono-term-extract');
            logSystem('开始术语抽取');

            // 创建工作流事件: 术语提取开始
            const terms = await extractMonolingualTermsAction(inputText);

            // 完成工作流事件: 术语提取
            setPreStep('dict-lookup');
            logSystem('开始词典查询');

            // 从 TermCandidate[] 中提取术语字符串
            const termStrings = Array.isArray(terms)
                ? terms.map((t: any) => t.term).filter(Boolean)
                : [];
            logger.debug('提取的术语:', termStrings);
            // 可按需使用已启用术语映射：preTermEnabled
            const termCandidates = termStrings.slice(0, 50).map(t => ({ term: t, score: 1.0 }));
            const dict = await lookupDictionaryAction(termCandidates, {
                projectId: typeof projectId === 'string' ? projectId : undefined,
            });

            // 完成工作流事件: 词典查询
            setPreStep('term-embed-trans');
            logSystem('开始术语嵌入翻译');

            const translation = await embedAndTranslateAction(
                inputText,
                sourceLanguage || 'auto',
                targetLanguage || 'auto',
                dict
            );
            logger.debug('翻译结果:', translation);
            if (!String(translation || '').trim()) {
                throw new Error('预翻译未返回有效译文，无法进入人工复核');
            }

            // Persist before marking the result as visible/applied. A failed write
            // must not leave an apparently successful translation in the editor.
            try {
                await savePreTranslateResultsAction(
                    itemId,
                    {
                        terms: terms,
                        dict: dict,
                        embedded: translation,
                        targetText: translation,
                    },
                    inputText,
                    options.expectedTargetText,
                    options.preTranslateRunId
                );
                logInfo('预翻译结果已保存到数据库');
            } catch (error) {
                logger.error('保存预翻译结果失败');
                throw error;
            }
            if (isCurrentItem()) {
                setPreOutputs({
                    itemId,
                    terms,
                    dict,
                    translation,
                });
                setTargetTranslationText(translation || '');
            }
            logInfo('单例翻译完成');

            // 记录 MT 阶段成功完成
            await recordGoToNextTranslationProcessEventAction(itemId, 'MT', 'AGENT', 'SUCCESS');
        } catch (error) {
            logger.error('单例翻译失败');

            // 记录 MT 阶段失败
            await recordGoToNextTranslationProcessEventAction(itemId, 'MT', 'AGENT', 'FAILED');
            throw error;
        } finally {
            setPreRunning(false);
            setPreStep('idle');
        }
    };

    const undoTranslate = async () => {
        if (!activeDocumentItem?.id) return;
        const itemId = String(activeDocumentItem.id);
        if (contentItemId !== itemId || sourceLoading) {
            throw new Error('当前分段内容尚未加载完成');
        }
        const inputSource = String(sourceText || '');
        const inputTarget = String(targetText || '');
        const isCurrentItem = () =>
            activeItemIdRef.current === itemId &&
            sourceTextRef.current === inputSource &&
            targetTextRef.current === inputTarget;

        try {
            logAgent('MT');
            logSystem('撤销单例翻译');
            // Persist first with the source snapshot that the user reviewed.
            // A failed write must leave the visible translation and its stage
            // untouched so the user can retry without losing work.
            await savePreTranslateResultsAction(
                itemId,
                {
                    terms: [],
                    dict: [],
                    embedded: '',
                    targetText: '',
                },
                inputSource,
                inputTarget
            );
            if (isCurrentItem()) {
                setTargetTranslationText('');
                setPreOutputs(undefined);
            }
            logInfo('单例翻译结果已撤销');
        } catch (error) {
            logger.error('撤销单例翻译失败');
            throw error;
        }
    };

    const runQA = async (options: {
        expectedSourceText: string;
        expectedTargetText: string;
        qaRunId: string;
    }) => {
        if (!activeDocumentItem?.id) return;
        const itemId = String(activeDocumentItem.id);
        const qaRunId = String(options.qaRunId || '').trim();
        if (!qaRunId) {
            throw new Error('质检运行标识缺失，请刷新后重试');
        }
        if (contentItemId !== itemId || sourceLoading) {
            toast.error('当前分段仍在加载，请加载完成后再启动质检');
            throw new Error('当前分段内容尚未加载完成');
        }
        if (!targetText || String(targetText).trim() === '') {
            toast.error(t('qaRequiresTranslation'));
            throw new Error('当前分段译文为空');
        }
        const inputSource = String(sourceText || '');
        const inputTarget = String(targetText || '');
        if (inputSource !== String(options.expectedSourceText || '')) {
            throw new Error('当前分段原文已变化，已取消过期质检运行');
        }
        if (inputTarget !== String(options.expectedTargetText || '')) {
            throw new Error('当前分段译文已变化，已取消过期质检运行');
        }
        const isCurrentItem = () =>
            activeItemIdRef.current === itemId &&
            sourceTextRef.current === inputSource &&
            targetTextRef.current === inputTarget;

        try {
            logAgent('QA');
            setQARunning(true);
            logger.debug('QA开始时的文本:', {
                sourceLength: sourceText?.length || 0,
                targetLength: targetText?.length || 0,
            });

            // 记录 QA 阶段开始
            try {
                await recordGoToNextTranslationProcessEventAction(itemId, 'QA', 'AGENT', 'STARTED');
            } catch {
                logger.warn('QA 已启动，但开始事件记录失败');
            }

            // 结构关系评估只生成待复核的问题；修改译文必须由用户勾选后另行触发。
            setQAStep('bi-term-eval');
            logSystem('开始句法与规范关系质检');
            const result = await runQualityAssureAction(inputSource, inputTarget, {
                targetLanguage,
                locale,
            });
            if (!isCurrentItem()) throw new Error('当前分段已切换，已丢弃过期质检结果');
            setQAStep('syntax-eval');
            await saveQualityAssureResultsAction(
                itemId,
                {
                    biTerm: result.biTerm,
                    syntax: result.syntax,
                    syntaxEmbedded: null,
                },
                {
                    sourceText: inputSource,
                    targetText: inputTarget,
                    qaRunId,
                }
            );
            if (isCurrentItem()) {
                setQAOutputs({ itemId, biTerm: result.biTerm, syntax: result.syntax });
                setQASyntaxEmbedded(undefined);
            }

            logInfo('单例质检完成');

            // 记录 QA 阶段成功完成
            try {
                await recordGoToNextTranslationProcessEventAction(itemId, 'QA', 'AGENT', 'SUCCESS');
            } catch {
                logger.warn('QA 已完成，但成功事件记录失败');
            }
        } catch (e) {
            logger.error('单例质检失败');

            // 记录 QA 阶段失败
            try {
                await recordGoToNextTranslationProcessEventAction(itemId, 'QA', 'AGENT', 'FAILED');
            } catch {
                logger.warn('QA 失败，且失败事件记录失败');
            }
            throw e;
        } finally {
            setQARunning(false);
            setQAStep('idle');
        }
    };

    const runPostEdit = async () => {
        if (!activeDocumentItem?.id) return;
        const itemId = String(activeDocumentItem.id);
        if (contentItemId !== itemId || sourceLoading) {
            toast.error('当前分段仍在加载，请加载完成后再启动译后编辑');
            throw new Error('当前分段内容尚未加载完成');
        }
        if (!sourceText || String(sourceText).trim() === '') {
            toast.error(t('postEditRequiresSource'));
            throw new Error('当前分段原文为空');
        }
        if (!targetText || String(targetText).trim() === '') {
            toast.error(t('postEditRequiresTranslation'));
            throw new Error('当前分段译文为空');
        }
        const inputSource = String(sourceText);
        const inputTarget = String(targetText);
        const requestId = ++postEditRequestRef.current;
        const isCurrentItem = () =>
            activeItemIdRef.current === itemId &&
            sourceTextRef.current === inputSource &&
            targetTextRef.current === inputTarget;
        let outcomePhase: PostEditOutcomePhase = 'query';

        try {
            logAgent('POST_EDIT');
            setPERunning(true);
            // Clear only the visible output for the active item. The outcome is
            // tracked separately and keyed by item, so another segment cannot
            // inherit this run's loading or failure state.
            setPosteditOutputs(undefined);
            setPosteditOutcome({ itemId, status: 'loading', phase: outcomePhase });
            logSystem('开始译后编辑流程');

            // 记录 POST_EDIT 阶段开始
            await recordGoToNextTranslationProcessEventAction(
                itemId,
                'POST_EDIT',
                'AGENT',
                'STARTED'
            );

            // 1. 语篇查询
            setPeStep('discourse-query');
            logSystem('开始语篇查询');
            const queryResult = await queryDiscourseAction(inputSource, { documentItemId: itemId });
            if (!isCurrentItem()) throw new Error('当前分段已切换，已丢弃过期语篇查询结果');

            // Query evidence is useful even if a later evaluation/rewrite step
            // fails. Expose it now, but keep the workflow outcome as loading
            // until the complete post-edit proposal has been persisted.
            setPosteditOutputs({ itemId, memos: queryResult.hits });
            outcomePhase = 'evaluation';
            setPosteditOutcome({ itemId, status: 'loading', phase: outcomePhase });

            // 2. 语篇评估
            setPeStep('discourse-eval');
            logSystem('开始语篇评估');
            const evaluation = await evaluateDiscourseAction(inputSource, inputTarget, {
                references: queryResult.hits,
            });
            if (!isCurrentItem()) throw new Error('当前分段已切换，已丢弃过期语篇评估结果');

            // 3. 语篇嵌入改写
            outcomePhase = 'rewrite';
            setPosteditOutcome({ itemId, status: 'loading', phase: outcomePhase });
            setPeStep('discourse-embed-trans');
            logSystem('开始语篇嵌入改写');
            const rewrite = await embedDiscourseAction(inputSource, inputTarget, queryResult.hits);
            if (!isCurrentItem()) throw new Error('当前分段已切换，已丢弃过期语篇改写结果');

            // Persist before exposing a result.  The expected input snapshot
            // prevents an asynchronous post-edit response from overwriting a
            // segment edited in another tab while it was running.
            outcomePhase = 'persist';
            setPosteditOutcome({ itemId, status: 'loading', phase: outcomePhase });
            await savePostEditResultsAction(
                itemId,
                {
                    query: queryResult.hits,
                    evaluation,
                    rewrite,
                },
                { sourceText: inputSource, targetText: inputTarget }
            );
            if (!isCurrentItem()) throw new Error('当前分段已切换，已丢弃过期译后编辑结果');
            setPosteditOutputs({
                itemId,
                memos: queryResult.hits,
                discourse: evaluation,
                result: rewrite,
            });
            setPosteditOutcome(completePostEditOutcome(itemId, queryResult.hits));
            logInfo('译后编辑结果已保存到数据库，等待人工复核应用');

            // The rewrite remains a proposal until the reviewer explicitly
            // applies and persists it.  Do not make a local-only replacement
            // look like a saved translation.
            if (!isCurrentItem()) {
                throw new Error('当前分段已切换，未应用过期译后编辑建议');
            }

            logInfo('译后编辑流程完成');

            // 记录 POST_EDIT 阶段成功完成
            await recordGoToNextTranslationProcessEventAction(
                itemId,
                'POST_EDIT',
                'AGENT',
                'SUCCESS'
            );
        } catch (e) {
            logger.error('译后编辑失败');
            const failure = failedPostEditOutcome(itemId, outcomePhase, e, t('postEditFailed'));
            // A failed retrieval or downstream post-edit stage is not an empty
            // reference set. Keep the public, actionable failure on this
            // segment until the user retries or discards the result.
            if (isCurrentItem()) setPosteditOutcome(failure);
            toast.error(failure.message);

            // 记录 POST_EDIT 阶段失败
            await recordGoToNextTranslationProcessEventAction(
                itemId,
                'POST_EDIT',
                'AGENT',
                'FAILED'
            );
            throw e;
        } finally {
            if (requestId === postEditRequestRef.current) {
                setPERunning(false);
                setPeStep('idle');
            }
        }
    };

    const clearPostEditOutputs = (itemId: string) => {
        if (activeItemIdRef.current !== String(itemId)) return;
        setPosteditOutputs(undefined);
        clearPosteditOutcome(itemId);
        setPeStep('idle');
        logInfo('译后编辑结果已驳回，等待重新执行');
    };

    const clearQAOutputs = (itemId: string) => {
        if (activeItemIdRef.current !== String(itemId)) return;
        setQAOutputs(undefined);
        setQASyntaxEmbedded(undefined);
        setQAStep('idle');
        logInfo('质检结果已驳回，等待重新执行');
    };

    const initContentByID = async (id: string) => {
        // 如果id为空，则不进行获取
        if (!id) return;
        const requestId = ++contentLoadRef.current;
        const baselineRequestId = ++baselineRequestRef.current;
        try {
            setSourceLoading(true);
            setError(null);
            // Clear the previous segment immediately. Undefined fields in a partial
            // result must never leave another segment's workflow output visible.
            setPreOutputs(undefined);
            setQAOutputs(undefined);
            setPosteditOutputs(undefined);
            clearTranslationContent();
            const documentItem = await getContentByIdAction(id);
            if (requestId !== contentLoadRef.current) return;
            logger.debug('documentItem', documentItem);
            if (documentItem) {
                setTranslationContent({
                    itemId: id,
                    sourceText: documentItem.sourceText,
                    targetText: documentItem.targetText || '',
                });
                // 同步阶段状态（确保切换分段后状态正确）
                const documentStage = (documentItem as any)?.status || 'NOT_STARTED';
                setCurrentStage(documentStage as any);
                currentStageRef.current = documentStage as any;
                setSourceLoading(false);

                // 自动触发 baseline 翻译：如果没有译文且状态为 NOT_STARTED
                if (
                    !documentItem.targetText?.trim() &&
                    documentStage === 'NOT_STARTED' &&
                    documentItem.sourceText?.trim()
                ) {
                    const baselineSource = String(documentItem.sourceText || '');
                    const baselineTarget = String(documentItem.targetText || '');
                    try {
                        logInfo('自动生成基线翻译...');
                        logger.debug('自动基线翻译参数:', { sourceLanguage, targetLanguage });
                        const baselineText = await baselineTranslateAction(
                            documentItem.sourceText,
                            sourceLanguage || 'auto',
                            targetLanguage || 'auto'
                        );
                        const canApplyBaseline =
                            requestId === contentLoadRef.current &&
                            baselineRequestId === baselineRequestRef.current &&
                            activeItemIdRef.current === String(id) &&
                            sourceTextRef.current === baselineSource &&
                            targetTextRef.current === baselineTarget &&
                            currentStageRef.current === 'NOT_STARTED';
                        if (!canApplyBaseline) return;
                        if (baselineText) {
                            setTargetTranslationText(baselineText);
                            logInfo('基线翻译生成完成');
                        }
                    } catch (error) {
                        logger.error('自动基线翻译失败:', error);
                        logInfo('自动基线翻译失败，可手动重新生成');
                    }
                }

                // 注意：不要在这里更新 activeDocumentItem，会导致无限循环
                const intermediateResults = await getDocumentItemIntermediateResultsAction(id);
                if (requestId !== contentLoadRef.current) return;
                if (intermediateResults) {
                    const preTranslateSourceMatches =
                        intermediateResults.preTranslateSourceMatches === true;
                    // 只传递 setPreOutputs 需要的字段，避免传入非可序列化数据
                    setPreOutputs({
                        itemId: id,
                        terms: preTranslateSourceMatches
                            ? intermediateResults.preTranslateTerms
                            : undefined,
                        dict: preTranslateSourceMatches
                            ? intermediateResults.preTranslateDict
                            : undefined,
                        translation: preTranslateSourceMatches
                            ? intermediateResults.preTranslateEmbedded
                            : undefined,
                    });

                    // 只恢复质检字段；译后编辑结果由 PostEditPanel 按当前分段
                    // 单独恢复，不能借 QA 的全局输出槽混入另一个分段。
                    setQAOutputs({
                        itemId: id,
                        biTerm: intermediateResults.qualityAssureBiTerm,
                        syntax: intermediateResults.qualityAssureSyntax,
                    });
                }
            }
        } catch (err) {
            if (requestId !== contentLoadRef.current) return;
            setError(t('cannotLoadDocument'));
            logger.error('获取文档内容失败:', err);
        } finally {
            if (requestId === contentLoadRef.current) setSourceLoading(false);
        }
    };

    // 跳转相邻分段（上一条 / 下一条）
    const navigateRelative = async (delta: number) => {
        try {
            const tabs: any[] = (explorerTabs as any)?.documentTabs ?? [];
            const allItems: any[] = tabs.flatMap((t: any) => t.items ?? []);
            if (!allItems.length) return;
            const currentId = (activeDocumentItem as any)?.id;
            const idx = Math.max(
                0,
                allItems.findIndex(it => it.id === currentId)
            );
            const nextIdx = Math.min(Math.max(0, idx + delta), allItems.length - 1);
            const next = allItems[nextIdx];
            if (!next || next.id === currentId) return;
            const targetEditor = getTargetEditorInstance();
            const targetElement = targetEditor?.view.dom;
            const canLeave = canLeaveCurrentPostEditDraft(
                {
                    activeItemId: activeDocumentItem.id,
                    currentStage,
                    editorItemId: targetElement?.getAttribute('data-deeptrans-editor-item-id'),
                    editorJob: targetElement?.getAttribute('data-deeptrans-editor-job'),
                    editorDirty: targetElement?.getAttribute('data-deeptrans-editor-dirty'),
                },
                () => window.confirm(POST_EDIT_DRAFT_DISCARD_MESSAGE)
            );
            if (!canLeave) return;
            // Keep content, editor identity, and all save targets on the same item.
            // The active-item effect performs the actual content load.
            setActiveDocumentItem(next);
        } catch {}
    };

    useEffect(() => {
        if (activeDocumentItem.id && activeDocumentItem.id !== null) {
            setCurrentStage(activeDocumentItem.status as any);
            // 直接获取内容
            initContentByID(activeDocumentItem.id);
        }
    }, [activeDocumentItem.id]); // 添加contentID依赖

    useEffect(() => {}, [sourceText, targetText]);

    if (error) {
        return <div className="text-red-500">{error}</div>;
    }

    return (
        <div className={cn('flex size-full flex-col', className)}>
            {activeDocumentItem.id === null ||
            activeDocumentItem.id === undefined ||
            activeDocumentItem.id === '' ? (
                <Hello />
            ) : (
                <ResizablePanelGroup direction="vertical" className="size-full">
                    <ResizablePanel defaultSize={60} minSize={30}>
                        <div className="flex size-full h-full flex-col items-start text-foreground">
                            {activeDocumentItem?.id && (
                                <StageBadgeBar
                                    contentReady={
                                        !sourceLoading &&
                                        contentItemId === String(activeDocumentItem.id)
                                    }
                                    runTranslate={runTranslate}
                                    undoTranslate={undoTranslate}
                                    runQA={runQA}
                                    runPostEdit={runPostEdit}
                                    clearQAOutputs={clearQAOutputs}
                                    clearPostEditOutputs={clearPostEditOutputs}
                                    onOpenWorkflow={() => {
                                        setWorkflowOpen(true);
                                        setBottomPanelOpen(true);
                                    }}
                                    saveRecord={async (stage, actor, status) => {
                                        const event =
                                            await recordGoToNextTranslationProcessEventAction(
                                                activeDocumentItem.id,
                                                stage,
                                                actor,
                                                status
                                            );
                                        if (!event.success) {
                                            const message =
                                                event.error || '无法保存流程审计记录，请重试';
                                            // Sign-off and completion are human approval
                                            // boundaries: do not advance their status
                                            // without a persisted audit record. Earlier
                                            // automatic results stay usable but remain
                                            // visible in logs if their timeline write fails.
                                            if (
                                                stage === 'POST_EDIT_REVIEW' ||
                                                stage === 'SIGN_OFF' ||
                                                stage === 'COMPLETED'
                                            ) {
                                                throw new Error(message);
                                            }
                                            logger.warn('流程事件未记录');
                                        }
                                    }}
                                />
                            )}
                            {(() => {
                                const isVertical = stackLayout === 'vertical';
                                return (
                                    <div className="relative flex min-h-0 w-full flex-1 flex-col">
                                        <div className="min-h-0 flex-1">
                                            <div
                                                className={`flex w-full ${isVertical ? 'flex-col' : 'flex-row'} size-full items-stretch overflow-hidden border`}
                                            >
                                                <div
                                                    className={`${isVertical ? 'w-full' : 'w-1/2'} flex-1 overflow-auto`}
                                                >
                                                    <div className="flex items-center justify-between border-b bg-muted/40 px-2 py-1 text-[11px] text-foreground/70">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="font-medium">
                                                                {t('sourceText')}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                className="rounded p-0.5 text-foreground/60 transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                                onClick={() =>
                                                                    setStackLayout(current =>
                                                                        current === 'vertical'
                                                                            ? 'horizontal'
                                                                            : 'vertical'
                                                                    )
                                                                }
                                                                aria-label={rightSidebarT(
                                                                    'toggleLayout'
                                                                )}
                                                                title={rightSidebarT(
                                                                    'toggleLayout'
                                                                )}
                                                            >
                                                                {isVertical ? (
                                                                    <Rows size={14} />
                                                                ) : (
                                                                    <Columns size={14} />
                                                                )}
                                                            </button>
                                                        </div>
                                                        <span className="uppercase tracking-wider">
                                                            {sourceLanguage}
                                                        </span>
                                                    </div>
                                                    {sourceLoading ||
                                                    !sourceText ||
                                                    String(sourceText).trim() === '' ? (
                                                        <div className="space-y-3 p-4">
                                                            <div className="space-y-2">
                                                                <Skeleton className="h-4 w-full" />
                                                                <Skeleton className="h-4 w-3/4" />
                                                            </div>
                                                            <div className="pt-2 text-center">
                                                                <div className="text-sm text-muted-foreground">
                                                                    {t('loadingSource')}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <RichTextEditor
                                                            key={`source-${activeDocumentItem.id}`}
                                                            job="rawtext"
                                                            editorId={activeDocumentItem.id}
                                                            placeholder={t('editSourceHere')}
                                                            initialContent={sourceText}
                                                            readOnly={
                                                                currentStage !== 'NOT_STARTED' || isRunning
                                                            }
                                                        />
                                                    )}
                                                </div>
                                                <Separator
                                                    orientation={
                                                        isVertical ? 'horizontal' : 'vertical'
                                                    }
                                                    className={`${isVertical ? 'h-1 w-full' : 'h-full w-1'} z-100`}
                                                />
                                                <div
                                                    className={`${isVertical ? 'w-full' : 'w-1/2'} flex-1 overflow-auto`}
                                                >
                                                    <div className="flex items-center justify-between border-b bg-muted/40 px-2 py-1 text-[11px] text-foreground/70">
                                                        <span className="font-medium">
                                                            {t('targetText')}
                                                        </span>
                                                        <span className="uppercase tracking-wider">
                                                            {targetLanguage}
                                                        </span>
                                                    </div>
                                                    <div className="relative">
                                                        {isRunning && (
                                                            <span className="absolute left-0 right-0 top-0 h-0.5 animate-progress bg-indigo-500" />
                                                        )}
                                                        {/* 空译文状态：运行中使用 DeepL 式轻量闪烁占位，未开始保留空态提示 */}
                                                        {(!targetText ||
                                                            String(targetText).trim() === '') &&
                                                        isRunning ? (
                                                            <TranslationPendingPlaceholder
                                                                label={t('translatingTarget')}
                                                            />
                                                        ) : (!targetText ||
                                                              String(targetText).trim() === '') &&
                                                          currentStage === 'NOT_STARTED' ? (
                                                            <div className="space-y-3 p-4">
                                                                <div className="space-y-2">
                                                                    <Skeleton className="h-4 w-full" />
                                                                    <Skeleton className="h-4 w-3/4" />
                                                                </div>
                                                                <div className="pt-4 text-center">
                                                                    <div className="text-sm text-muted-foreground">
                                                                        {t(
                                                                            'clickToStartTranslation'
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="h-full">
                                                                <RichTextEditor
                                                                    key={`target-${activeDocumentItem.id}`}
                                                                    job="translation"
                                                                    editorId={activeDocumentItem.id}
                                                                    placeholder={t(
                                                                        'editTargetHere'
                                                                    )}
                                                                    initialContent={targetText}
                                                                    readOnly={
                                                                        !(
                                                                            (currentStage as any) ===
                                                                            'POST_EDIT_REVIEW'
                                                                        )
                                                                    }
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        {/* 右下角：上一条 / 下一条 / 面板切换 */}
                                        <div className="pointer-events-auto absolute bottom-2 right-2 z-20 flex items-center gap-2">
                                            <button
                                                className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background/90 shadow hover:bg-muted"
                                                onClick={toggleBottomPanel}
                                                title={
                                                    isBottomPanelOpen
                                                        ? t('hidePanel')
                                                        : t('showPanel')
                                                }
                                            >
                                                {isBottomPanelOpen ? (
                                                    <PanelBottomClose className="h-4 w-4" />
                                                ) : (
                                                    <PanelBottomOpen className="h-4 w-4" />
                                                )}
                                            </button>
                                            <button
                                                className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background/90 shadow hover:bg-muted"
                                                onClick={() => navigateRelative(-1)}
                                                title={t('previous')}
                                            >
                                                <ChevronLeft className="h-4 w-4" />
                                            </button>
                                            <button
                                                className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background/90 shadow hover:bg-muted"
                                                onClick={() => navigateRelative(1)}
                                                title={t('next')}
                                            >
                                                <ChevronRight className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </ResizablePanel>

                    {isBottomPanelOpen && (
                        <>
                            <ResizableHandle className="h-1 bg-secondary" />
                            <ResizablePanel defaultSize={40} minSize={20} maxSize={60}>
                                <TranslationProcessPanel
                                    workflowOpen={workflowOpen}
                                    onWorkflowOpenChange={open => {
                                        setWorkflowOpen(open);
                                        if (open) setBottomPanelOpen(true);
                                    }}
                                />
                            </ResizablePanel>
                        </>
                    )}
                </ResizablePanelGroup>
            )}
        </div>
    );
}
