// 动作部分：包含预翻译、质量评估、译后编辑等
import {
    embedAndTranslateAction,
    extractMonolingualTermsAction,
    lookupDictionaryAction,
} from '@/actions/pre-translate';
import { useTargetEditor } from '@/hooks/useEditor';
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
    saveQualityAssureResultsAction,
} from '@/actions/intermediate-results';
import { useChatbarContent, useChatbarStream, useRightPanel } from '@/hooks/useRightPanel';
import { useTranslationLanguage } from '@/hooks/useTranslation';

import { updateDocItemStatusAction } from '@/actions/document-item';
import { recordGoToNextTranslationProcessEventAction } from '@/actions/translation-process-event';
import { useAgentWorkflowSteps } from '@/hooks/useAgentWorkflowSteps';
import { useExplorerTabs } from '@/hooks/useExplorerTabs';
import { useLogger } from '@/hooks/useLogger';
import type { DocumentItemTab } from '@/types/explorerTabs';
import { useEffect, useRef, useState } from 'react';

import { useActiveDocumentItem } from '@/hooks/useActiveDocumentItem';
import { useRunningState } from '@/hooks/useRunning';
import { useUserSettings } from '@/hooks/useUserSettings';
import { createLogger } from '@/lib/logger';
import { normalizeKeyboardKey } from '@/lib/keyboard-key';
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
    const { preTranslateEmbedded, setQASyntaxEmbedded } = useAgentWorkflowSteps();
    const { logSystem, logAgent, logInfo, logWarning, logError } = useLogger();
    const { currentStage, setCurrentStage } = useTranslationState();
    const { isRunning, setIsRunning } = useRunningState();
    const { data: session } = useSession();
    const userId = session?.user?.id;
    const locale = useLocale();
    const { mode, setMode } = useRightPanel();
    const { chatbarContent, addMessage, updateMessage } = useChatbarContent();
    const { handleStreamResponse } = useChatbarStream();
    const { sourceLanguage, targetLanguage } = useTranslationLanguage();

    const { contentItemId, sourceText, targetText, setTargetTranslationText } =
        useTranslationContent();
    const targetEditor = useTargetEditor();
    const { explorerTabs, setExplorerTabs } = useExplorerTabs();
    const [batchProgress, setBatchProgress] = useState<number | undefined>(undefined);
    const [batchOpen, setBatchOpen] = useState(false);
    const [progressTitle, setProgressTitle] = useState<string>('');
    const [batchJobId, setBatchJobId] = useState<string | undefined>(undefined);
    const batchCancelRef = useRef(false);
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
    const qaTargetTextRef = useRef(String(targetText || preTranslateEmbedded || ''));
    activeDocumentItemRef.current = activeDocumentItem;
    activeItemIdRef.current = String(activeDocumentItem?.id || '');
    sourceTextRef.current = String(sourceText || '');
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
            const currentText = sourceText;
            if (!currentText.trim()) {
                toast.error('原文内容为空，无法进行预翻译');
                return;
            }
            const isCurrentItem = () =>
                activeItemIdRef.current === id && sourceTextRef.current === currentText;
            logAgent('翻译开始');

            setIsRunning(true);
            setCurrentOperation('translate_single');

            setCurrentStage('MT');
            let terms: any[] = [];
            let dict: any[] = [];
            let embedded = '';
            // 预翻译三步：单语术语提取 → 词典查询 → 术语嵌入
            try {
                setPreRunning(true);
                setPreStep('mono-term-extract');
                logAgent('预翻译 · 术语抽取');
                terms = await extractMonolingualTermsAction(currentText, {
                    prompt: undefined,
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
                    dict = await lookupDictionaryAction(termCandidates);
                } else {
                    const tokens = currentText
                        .split(/[\s,.;，。；、]+/)
                        .filter(Boolean)
                        .slice(0, 10);
                    dict = await lookupDictionaryAction(
                        tokens.map((x: any) => ({ term: x, score: 1.0 }))
                    );
                }
                if (isCurrentItem()) setPreOutputs({ itemId: id, dict });

                setPreStep('term-embed-trans');
                logAgent('预翻译 · 术语嵌入');
                embedded = await embedAndTranslateAction(
                    currentText,
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

            // 先持久化再更新界面，避免写入失败时误显示为“已应用”。
            try {
                await savePreTranslateResultsAction(
                    id,
                    {
                        terms,
                        dict,
                        embedded,
                        targetText: translatedText,
                    },
                    currentText
                );
                logInfo('预翻译结果已保存到数据库');
            } catch (error) {
                logError(`保存预翻译结果失败: ${error}`);
                throw error;
            }
            if (isCurrentItem()) {
                setPreOutputs({
                    itemId: id,
                    terms,
                    dict,
                    translation: embedded,
                });
                setTargetTranslationText(translatedText);
            }

            // 无论编辑器是否存在都写入状态并同步本地视图
            try {
                await updateDocItemStatusAction(id, 'MT');
            } catch {}
            syncLocalStatusById(id, 'MT');

            // 更新目标编辑器与提示
            if (isCurrentItem() && targetEditor?.editor) {
                targetEditor.editor.commands.setContent(translatedText);
                toast.success('翻译完成：翻译已完成并更新到目标编辑器');
                logAgent('翻译完成');
            }
            if (isCurrentItem()) setCurrentStage('MT_REVIEW');
            await updateDocItemStatusAction(id, 'MT_REVIEW');
            syncLocalStatusById(id, 'MT_REVIEW');
        } catch (error) {
            logger.error('翻译失败:', error);
            toast.error('翻译失败：请检查网络连接或稍后再试');
            logError(`翻译失败: ${error}`);
        } finally {
            setIsRunning(false);
            setCurrentOperation('idle');
        }
    };

    const handleBatchTranslate = async () => {
        try {
            setCurrentOperation('translate_batch');
            const jid = `${(explorerTabs as any)?.projectId || 'proj'}.${Date.now()}`;
            setBatchJobId(jid);
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

            setIsRunning(true);
            setCurrentStage('MT' as any);
            setBatchProgress(0);
            logInfo(`批量翻译开始（服务端并发）：共 ${total} 个未开始分段`);

            // 只处理未开始的分段
            const itemIds = notStartedItems.map(i => i.id);
            const startRes = await fetch('/api/batch-pre-translate/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    itemIds,
                    sourceLanguage: sourceLanguage || 'auto',
                    targetLanguage: targetLanguage || 'auto',
                }),
            }).then(r => r.json());

            const { batchId, total: srvTotal } = startRes || {};
            if (!batchId) {
                setIsRunning(false);
                setBatchOpen(false);
                setCurrentOperation('idle');
                toast.error('批量翻译无法启动：没有有效的未开始分段');
                return;
            }

            setBatchJobId(batchId);
            let tries = 0;
            const timer = setInterval(async () => {
                tries += 1;
                try {
                    const p = await fetch(
                        `/api/batch-pre-translate/progress?batchId=${encodeURIComponent(batchId)}`
                    ).then(r => r.json());
                    setBatchProgress(p.percent);
                    if (p.percent >= 100) {
                        clearInterval(timer);
                        try {
                            await fetch('/api/batch-pre-translate/persist', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ batchId }),
                            });
                            // 批量更新状态到 MT_REVIEW
                            for (const item of notStartedItems) {
                                try {
                                    await updateDocItemStatusAction(item.id, 'MT_REVIEW');
                                    await recordGoToNextTranslationProcessEventAction(
                                        item.id,
                                        'MT',
                                        'AGENT',
                                        'SUCCESS'
                                    );
                                    await recordGoToNextTranslationProcessEventAction(
                                        item.id,
                                        'MT_REVIEW',
                                        'HUMAN',
                                        'SUCCESS'
                                    );
                                } catch (e) {
                                    logger.error(`更新分段 ${item.id} 状态失败:`, e);
                                }
                            }
                        } catch {}

                        setIsRunning(false);
                        setCurrentStage('MT' as any);
                        setBatchOpen(false);
                        setCurrentOperation('idle');

                        if ((p.failed || 0) > 0) {
                            toast.warning(
                                `批量翻译完成，但有失败项：成功 ${p.done}，失败 ${p.failed}`
                            );
                        } else {
                            toast.success(`批量翻译完成：成功处理 ${p.done} 个未开始分段`);
                        }

                        // 刷新左侧 explorerTabs
                        try {
                            const tabs = await fetch(
                                `/api/explorer-tabs?projectId=${encodeURIComponent((explorerTabs as any)?.projectId || '')}`
                            ).then(r => r.json());
                            setExplorerTabs(tabs);
                        } catch {}
                        setBatchJobId(undefined);
                    }
                } catch {}
                if (tries > 600) {
                    clearInterval(timer);
                    setBatchOpen(false);
                    setIsRunning(false);
                    setCurrentOperation('idle');
                    toast.error('批量翻译超时：请稍后在日志中查看进度');
                    setBatchJobId(undefined);
                }
            }, 1000);
        } catch (e) {
            logger.error('批量翻译启动或轮询失败:', e);
            setIsRunning(false);
            setCurrentOperation('idle');
            setBatchOpen(false);
            toast.error(`批量翻译失败：${String(e)}`);
        }
    };

    const evaluateCurrentTranslation = async (provider: string = 'openai') => {
        let operationItemId = '';
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
            try {
                setQARunning(true);
                setCurrentStage('QA' as any);
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

            // 更新状态：从 MT_REVIEW 到 QA_REVIEW。状态写入是业务门禁，
            // 时间线事件失败只记录告警，不能把已经成功的质检标成失败。
            try {
                // 1. 更新数据库状态
                await updateDocItemStatusAction(id, 'QA_REVIEW');

                // 2. 同步本地状态
                syncLocalStatusById(id, 'QA_REVIEW');

                // 3. 更新当前组件状态
                if (isCurrentItem()) setCurrentStage('QA_REVIEW' as any);

                logInfo(`分段 ${id} 质检完成，状态更新为 QA_REVIEW`);
            } catch (error) {
                logError(`状态更新失败: ${error}`);
                throw error;
            }
            try {
                await recordGoToNextTranslationProcessEventAction(id, 'QA', 'AGENT', 'SUCCESS');
                await recordGoToNextTranslationProcessEventAction(
                    id,
                    'QA_REVIEW',
                    'HUMAN',
                    'STARTED'
                );
            } catch (eventError) {
                logWarning(`质检已完成，但时间线事件记录失败: ${eventError}`);
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
            const persistedStage = String(
                (explorerTabs?.documentTabs || [])
                    .flatMap((tab: any) => tab.items || [])
                    .find((item: any) => String(item.id) === operationItemId)?.status || 'MT_REVIEW'
            );
            if (activeItemIdRef.current === operationItemId) {
                setCurrentStage(persistedStage as any);
            }

            // 提供更详细的错误信息
            let errorMessage = '质检失败：请检查网络连接或稍后再试';
            if (error.message?.includes('timeout')) {
                errorMessage = '质检超时：请检查网络连接或稍后重试';
            } else if (error.message?.includes('API')) {
                errorMessage = '质检API调用失败：请检查API配置';
            } else if (error.message?.includes('validation')) {
                errorMessage = '质检参数验证失败：请检查输入内容';
            }

            toast.error(errorMessage);
            logError(`质检失败: ${error.message || error}`);

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

            // 添加到聊天面板
            addMessage({
                content: `质检失败: ${error.message || '未知错误'}`,
                role: 'system',
            });
        } finally {
            setIsRunning(false);
            setCurrentOperation('idle');
        }
    };

    const handleBatchEvaluate = async () => {
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
                setCurrentOperation('idle');
                return;
            }

            setIsRunning(true);
            setCurrentStage('QA' as any);
            setBatchProgress(0);
            setProgressTitle('批量质检中');
            setBatchOpen(true);

            const itemIds = needEvaluateItems.map(i => i.id);
            const startQARes = await fetch('/api/batch-quality-assure/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    itemIds,
                    targetLanguage: targetLanguage || 'auto',
                }),
            }).then(r => r.json());

            const { batchId, total: srvTotal } = startQARes || {};
            if (!batchId) {
                setIsRunning(false);
                setBatchOpen(false);
                setCurrentOperation('idle');
                toast.error('批量质检无法启动：没有需要质检的分段');
                return;
            }

            setBatchJobId(batchId);

            // 轮询进度
            let tries = 0;
            const timer = setInterval(async () => {
                tries += 1;
                try {
                    const p = await fetch(
                        `/api/batch-quality-assure/progress?batchId=${encodeURIComponent(batchId)}`
                    ).then(r => r.json());
                    setBatchProgress(p.percent);
                    if (p.percent >= 100) {
                        clearInterval(timer);
                        let persistedCount = 0;
                        let persistFailed = false;
                        try {
                            const persistResponse = await fetch(
                                '/api/batch-quality-assure/persist',
                                {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ batchId }),
                                }
                            );
                            if (!persistResponse.ok) throw new Error('批量质检结果保存失败');
                            const persisted = await persistResponse.json();
                            const updatedIds = new Set<string>(persisted?.updatedIds || []);
                            persistedCount = updatedIds.size;
                            // 只为已成功落库的分段记录状态事件。
                            for (const item of needEvaluateItems.filter(candidate =>
                                updatedIds.has(candidate.id)
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
                                        'HUMAN',
                                        'STARTED'
                                    );
                                } catch (e) {
                                    logger.error(`更新分段 ${item.id} 状态失败:`, e);
                                }
                            }
                        } catch (error) {
                            persistFailed = true;
                            logger.error('批量质检结果保存失败:', error);
                            toast.error('批量质检结果保存失败，请稍后重试');
                        }

                        setIsRunning(false);
                        if (persistedCount > 0) setCurrentStage('QA_REVIEW' as any);
                        setBatchOpen(false);
                        setCurrentOperation('idle');

                        if (persistFailed) {
                            // 已在上方给出可操作的保存失败提示。
                        } else if ((p.failed || 0) > 0 || persistedCount < p.done) {
                            toast.warning(
                                `批量质检完成，但有失败项：已保存 ${persistedCount}，处理失败 ${p.failed || 0}`
                            );
                        } else {
                            toast.success(
                                `批量质检完成：成功保存 ${persistedCount} 个预翻译复核分段`
                            );
                        }

                        // 刷新左侧 explorerTabs
                        try {
                            const tabs = await fetch(
                                `/api/explorer-tabs?projectId=${encodeURIComponent((explorerTabs as any)?.projectId || '')}`
                            ).then(r => r.json());
                            setExplorerTabs(tabs);
                        } catch {}
                        setBatchJobId(undefined);
                    }
                } catch {}
                if (tries > 600) {
                    // 最长 10 分钟
                    clearInterval(timer);
                    setBatchOpen(false);
                    setIsRunning(false);
                    setCurrentOperation('idle');
                    toast.error('批量质检超时：请稍后在日志中查看进度');
                    setBatchJobId(undefined);
                }
            }, 1000);
        } catch (e) {
            setIsRunning(false);
            setBatchOpen(false);
            setCurrentOperation('idle');
            toast.error(`批量质检启动失败：${String(e)}`);
        }
    };

    // 提取批量签发逻辑，便于快捷键和菜单复用
    const batchSignoff = async () => {
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

            setProgressTitle('批量签发中');
            setBatchProgress(0);
            setBatchOpen(true);
            setIsRunning(true);
            setCurrentOperation('signoff_batch');

            let done = 0;
            for (const it of itemsToSignoff) {
                try {
                    await updateDocItemStatusAction(it.id, 'SIGN_OFF');
                    // 只记录 SIGN_OFF 事件
                    await recordGoToNextTranslationProcessEventAction(
                        it.id,
                        'SIGN_OFF',
                        'HUMAN',
                        'SUCCESS'
                    );
                } catch (e) {
                    logger.error(`签发分段 ${it.id} 失败:`, e);
                }
                done += 1;
                setBatchProgress(Math.round((done / totalToSignoff) * 100));
            }

            // 更新当前激活项（如果也在处理列表中）
            try {
                if ((activeDocumentItem as any)?.id) {
                    const currentItem = itemsToSignoff.find(
                        (it: any) => it.id === (activeDocumentItem as any)?.id
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
                                    const shouldUpdate = itemsToSignoff.some(
                                        (x: any) => x.id === it.id
                                    );
                                    return shouldUpdate ? { ...it, status: 'SIGN_OFF' } : it;
                                }),
                            };
                        }
                        return tab;
                    }),
                };
            });

            setBatchOpen(false);
            toast.success(`批量签发完成：共处理 ${totalToSignoff} 个分段`);
        } catch (e) {
            toast.error(`批量签发失败：${String(e)}`);
        } finally {
            setIsRunning(false);
            setCurrentOperation('idle');
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
            const totalToProcess = itemsToProcess.length;
            const completedCount = items.length - totalToProcess;
            let workflowItems = itemsToProcess;

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
                const preTranslateIds = needPreTranslateItems.map(i => i.id);
                try {
                    const startRes = await fetch('/api/batch-pre-translate/start', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            itemIds: preTranslateIds,
                            sourceLanguage: sourceLanguage || 'auto',
                            targetLanguage: targetLanguage || 'auto',
                        }),
                    }).then(r => r.json());
                    const { batchId } = startRes || {};
                    if (batchId) {
                        let tries = 0;
                        while (tries < 600) {
                            tries += 1;
                            try {
                                const p = await fetch(
                                    `/api/batch-pre-translate/progress?batchId=${encodeURIComponent(batchId)}`
                                ).then(r => r.json());
                                setBatchProgress(
                                    Math.round(
                                        (p.percent * needPreTranslateItems.length) / totalToProcess
                                    )
                                );
                                if (p.percent >= 100) break;
                            } catch {}
                            await new Promise(res => setTimeout(res, 1000));
                        }
                        try {
                            const persistResponse = await fetch(
                                '/api/batch-pre-translate/persist',
                                {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ batchId }),
                                }
                            );
                            if (!persistResponse.ok) {
                                const payload = await persistResponse.json().catch(() => ({}));
                                throw new Error(payload?.error || '批量预译结果保存失败');
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
                } catch (error) {
                    logger.error('批量预译失败:', error);
                    throw error;
                }
            }

            // 2) 批量评估 - 只处理需要评估的分段（MT状态）
            const needQaItems = workflowItems.filter(
                (it: any) => it.status === 'MT' || it.status === 'MT_REVIEW'
            );

            if (needQaItems.length > 0) {
                setCurrentOperation('evaluate_batch');
                setProgressTitle('批量评估中');
                const qaIds = needQaItems.map(i => i.id);
                try {
                    const startQARes = await fetch('/api/batch-quality-assure/start', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            itemIds: qaIds,
                            targetLanguage: targetLanguage || 'auto',
                        }),
                    }).then(r => r.json());
                    const { batchId } = startQARes || {};
                    if (batchId) {
                        let tries = 0;
                        while (tries < 600) {
                            tries += 1;
                            try {
                                const p = await fetch(
                                    `/api/batch-quality-assure/progress?batchId=${encodeURIComponent(batchId)}`
                                ).then(r => r.json());
                                // 计算总进度：预译进度 + 评估进度
                                const preTranslateProgress =
                                    needPreTranslateItems.length > 0
                                        ? needPreTranslateItems.length
                                        : 0;
                                const currentQaProgress = Math.round(
                                    (p.percent * needQaItems.length) / totalToProcess
                                );
                                setBatchProgress(
                                    Math.round(
                                        ((preTranslateProgress + currentQaProgress) /
                                            totalToProcess) *
                                            100
                                    )
                                );
                                if (p.percent >= 100) break;
                            } catch {}
                            await new Promise(res => setTimeout(res, 1000));
                        }
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
                                throw new Error(payload?.error || '批量质检结果保存失败');
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

            const requiresHumanQaReview = workflowItems.some((item: any) =>
                ['NOT_STARTED', 'MT', 'MT_REVIEW', 'QA', 'QA_REVIEW'].includes(
                    String(item.status || 'NOT_STARTED')
                )
            );
            if (requiresHumanQaReview) {
                setBatchOpen(false);
                try {
                    const refreshed = await fetch(
                        `/api/explorer-tabs?projectId=${encodeURIComponent((explorerTabs as any)?.projectId || '')}`
                    ).then(response => response.json());
                    setExplorerTabs(refreshed);
                    const refreshedActive = (refreshed?.documentTabs || [])
                        .flatMap((tab: any) => tab.items || [])
                        .find((item: any) => item.id === aid);
                    if (refreshedActive?.status) setCurrentStage(refreshedActive.status as any);
                } catch {}
                toast.info('自动流程已停在质检复核，请确认风险并按需生成修订译文');
                return;
            }

            // 3) 标记译后→签发→完成（当前页签）- 只处理需要推进的分段
            setProgressTitle('批量完成中');
            setCurrentOperation('complete_batch');
            let done = 0;

            for (const it of itemsToProcess) {
                try {
                    // 根据当前状态决定需要推进到哪个阶段
                    let targetStatus = 'COMPLETED';

                    // 如果已经是SIGN_OFF，直接到COMPLETED
                    if (it.status === 'SIGN_OFF') {
                        targetStatus = 'COMPLETED';
                    }
                    // 如果是POST_EDIT或POST_EDIT_REVIEW，先到SIGN_OFF再到COMPLETED
                    else if (it.status === 'POST_EDIT' || it.status === 'POST_EDIT_REVIEW') {
                        await updateDocItemStatusAction(it.id, 'SIGN_OFF');
                        await recordGoToNextTranslationProcessEventAction(
                            it.id,
                            'SIGN_OFF',
                            'HUMAN',
                            'SUCCESS'
                        );
                        targetStatus = 'COMPLETED';
                    }
                    // 如果是QA或QA_REVIEW，先到POST_EDIT再到SIGN_OFF再到COMPLETED
                    else if (it.status === 'QA' || it.status === 'QA_REVIEW') {
                        await updateDocItemStatusAction(it.id, 'POST_EDIT');
                        await recordGoToNextTranslationProcessEventAction(
                            it.id,
                            'POST_EDIT',
                            'AGENT',
                            'SUCCESS'
                        );
                        await updateDocItemStatusAction(it.id, 'SIGN_OFF');
                        await recordGoToNextTranslationProcessEventAction(
                            it.id,
                            'SIGN_OFF',
                            'HUMAN',
                            'SUCCESS'
                        );
                        targetStatus = 'COMPLETED';
                    }
                    // 如果是MT或MT_REVIEW，需要先到QA再到POST_EDIT再到SIGN_OFF再到COMPLETED
                    else if (it.status === 'MT' || it.status === 'MT_REVIEW') {
                        // 这些应该已经在批量评估中处理过了，这里直接推进
                        await updateDocItemStatusAction(it.id, 'QA');
                        await recordGoToNextTranslationProcessEventAction(
                            it.id,
                            'QA',
                            'AGENT',
                            'SUCCESS'
                        );
                        await updateDocItemStatusAction(it.id, 'POST_EDIT');
                        await recordGoToNextTranslationProcessEventAction(
                            it.id,
                            'POST_EDIT',
                            'AGENT',
                            'SUCCESS'
                        );
                        await updateDocItemStatusAction(it.id, 'SIGN_OFF');
                        await recordGoToNextTranslationProcessEventAction(
                            it.id,
                            'SIGN_OFF',
                            'HUMAN',
                            'SUCCESS'
                        );
                        targetStatus = 'COMPLETED';
                    }
                    // 如果是NOT_STARTED，应该已经在批量预译中处理过了
                    else if (it.status === 'NOT_STARTED' || !it.status) {
                        await updateDocItemStatusAction(it.id, 'MT');
                        await recordGoToNextTranslationProcessEventAction(
                            it.id,
                            'MT',
                            'AGENT',
                            'SUCCESS'
                        );
                        await updateDocItemStatusAction(it.id, 'QA');
                        await recordGoToNextTranslationProcessEventAction(
                            it.id,
                            'QA',
                            'AGENT',
                            'SUCCESS'
                        );
                        await updateDocItemStatusAction(it.id, 'POST_EDIT');
                        await recordGoToNextTranslationProcessEventAction(
                            it.id,
                            'POST_EDIT',
                            'AGENT',
                            'SUCCESS'
                        );
                        await updateDocItemStatusAction(it.id, 'SIGN_OFF');
                        await recordGoToNextTranslationProcessEventAction(
                            it.id,
                            'SIGN_OFF',
                            'HUMAN',
                            'SUCCESS'
                        );
                        targetStatus = 'COMPLETED';
                    }

                    // 最终更新到COMPLETED
                    await updateDocItemStatusAction(it.id, targetStatus);
                    await recordGoToNextTranslationProcessEventAction(
                        it.id,
                        'COMPLETED',
                        'HUMAN',
                        'SUCCESS'
                    );
                } catch (error) {
                    logger.error(`处理分段 ${it.id} 失败:`, error);
                }
                done += 1;
                setBatchProgress(Math.round((done / totalToProcess) * 100));
            }

            // 更新当前激活项
            try {
                if ((activeDocumentItem as any)?.id) {
                    const currentItemStatus = items.find(
                        (it: any) => it.id === (activeDocumentItem as any)?.id
                    )?.status;
                    if (currentItemStatus !== 'COMPLETED') {
                        await updateDocItemStatusAction(
                            (activeDocumentItem as any)?.id,
                            'COMPLETED'
                        );
                        await recordGoToNextTranslationProcessEventAction(
                            (activeDocumentItem as any)?.id,
                            'COMPLETED',
                            'HUMAN',
                            'SUCCESS'
                        );
                    }
                }
            } catch {}

            // 本地同步（仅当前页签）
            setExplorerTabs((prev: any) => {
                if (!prev?.documentTabs) return prev;
                return {
                    ...prev,
                    documentTabs: prev.documentTabs.map((tab: any) => ({
                        ...tab,
                        items: (tab.items ?? []).map((it: any) => {
                            const inCurrent = (currentTab?.items ?? []).some(
                                (x: any) => x.id === it.id
                            );
                            const wasProcessed = itemsToProcess.some((x: any) => x.id === it.id);
                            return inCurrent && wasProcessed ? { ...it, status: 'COMPLETED' } : it;
                        }),
                    })),
                };
            });

            setCurrentStage('COMPLETED' as any);
            setBatchProgress(100);
            setBatchOpen(false);

            // 显示处理统计信息
            const message = `一步到完成：处理了 ${totalToProcess} 个分段`;
            if (completedCount > 0) {
                toast.success(`${message}，跳过了 ${completedCount} 个已完成分段`);
            } else {
                toast.success(message);
            }
        } catch (e) {
            toast.error(`一步到完成失败：${String(e)}`);
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
                toast.error(
                    '没有需要进入译后编辑的分段：所有分段都已进入译后编辑或未处于质检复核阶段'
                );
                return;
            }

            setIsRunning(true);
            setCurrentOperation('post_edit_batch');
            setProgressTitle('批量译后编辑中');
            setBatchProgress(0);
            setBatchOpen(true);
            logInfo(`批量译后编辑开始：共 ${total} 个需要进入译后编辑的分段`);

            let done = 0;
            for (const it of needPostEditItems) {
                try {
                    await updateDocItemStatusAction(it.id, 'POST_EDIT');
                    await recordGoToNextTranslationProcessEventAction(
                        it.id,
                        'POST_EDIT',
                        'AGENT',
                        'SUCCESS'
                    );
                } catch (e) {
                    logger.error(`更新分段 ${it.id} 状态失败:`, e);
                }
                done += 1;
                setBatchProgress(Math.round((done / total) * 100));
            }

            try {
                const currentId = (activeDocumentItem as any)?.id;
                if (currentId && needPostEditItems.some((it: any) => it.id === currentId)) {
                    setCurrentStage('POST_EDIT' as any);
                }
            } catch {}

            try {
                const tabsRes = await fetch(
                    `/api/explorer-tabs?projectId=${encodeURIComponent((explorerTabs as any)?.projectId || '')}`
                ).then(r => r.json());
                setExplorerTabs(tabsRes);
            } catch {}

            setBatchOpen(false);
            toast.success(`批量译后编辑完成：共处理 ${total} 个分段`);
        } catch (e) {
            toast.error(`批量译后编辑失败：${String(e)}`);
        } finally {
            setIsRunning(false);
            setCurrentOperation('idle');
        }
    };

    // 全局快捷键：⌘B 批量预译；⌘E 批量评估；⌘⇧S 批量签发
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            const isMeta = e.metaKey || e.ctrlKey;
            if (!isMeta || isRunning) return;
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
            // ⌘[
            if (key === '[') {
                e.preventDefault();
                // 调用“前一步/回退阶段”
                const id = (activeDocumentItem as any)?.id;
                if (!id) return;
                const mapping: Record<string, { to?: string; prev?: string }> = {
                    QA: { to: 'MT', prev: 'MT' },
                    POST_EDIT: { to: 'QA', prev: 'QA' },
                    COMPLETED: { to: 'POST_EDIT', prev: 'POST_EDIT' },
                };
                const m = mapping[currentStage as string];
                if (m?.to) {
                    updateDocItemStatusAction(id, m.to)
                        .then(() => {
                            if (m.prev) setCurrentStage(m.prev as any);
                        })
                        .catch(() => {});
                }
                return;
            }
            // ⌘]
            if (key === ']') {
                e.preventDefault();
                // 调用“后一步/推进阶段”
                const id = (activeDocumentItem as any)?.id;
                if (!id) return;
                const mapping: Record<string, { to?: string; next?: string }> = {
                    MT: { to: 'QA', next: 'QA' },
                    QA: { to: 'POST_EDIT', next: 'POST_EDIT' },
                    POST_EDIT: { to: 'COMPLETED', next: 'COMPLETED' },
                };
                const m = mapping[currentStage as string];
                if (m?.to) {
                    updateDocItemStatusAction(id, m.to)
                        .then(() => {
                            if (m.next) setCurrentStage(m.next as any);
                        })
                        .catch(() => {});
                }
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
                    setIsRunning={setIsRunning}
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
                            currentOperation === 'post_edit_batch')
                    }
                    // 修复：只允许 QA_REVIEW 状态的分段进入译后编辑
                    canEnter={(explorerTabs?.documentTabs ?? [])
                        .flatMap(t => t.items ?? [])
                        .some((it: any) => it.status === 'QA_REVIEW')}
                    onMarkReviewed={async () => {
                        try {
                            if (!sourceText.trim() && !targetText.trim()) {
                                toast.error('没有可审批的内容：请先进行翻译或评估');
                                return;
                            }

                            const id = (activeDocumentItem as any)?.id;
                            if (!id) {
                                toast.error('没有激活的文档项');
                                return;
                            }

                            // 检查当前分段状态是否为 QA_REVIEW
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
                            if (currentItemStatus !== 'QA_REVIEW') {
                                toast.error(
                                    `当前分段状态为 ${currentItemStatus || '未知'}，无法进入译后编辑。仅质检复核通过状态可以进行译后编辑`
                                );
                                return;
                            }

                            setCurrentOperation('post_edit_single');
                            setIsRunning(true);

                            try {
                                // 只更新当前选中分段的状态
                                await updateDocItemStatusAction(id, 'POST_EDIT');
                                // 记录译后编辑事件
                                await recordGoToNextTranslationProcessEventAction(
                                    id,
                                    'POST_EDIT',
                                    'AGENT',
                                    'SUCCESS'
                                );

                                // 同步本地状态
                                syncLocalStatusById(id, 'POST_EDIT');

                                // 更新当前组件状态
                                setCurrentStage('POST_EDIT' as any);

                                logInfo(`分段 ${id} 已进入译后编辑`);
                                toast.success('当前分段已进入译后编辑');
                            } catch (e) {
                                logError(`标记审批失败: ${e}`);
                                toast.error(`标记审批失败: ${String(e)}`);
                            }
                        } catch (e) {
                            logError(`标记审批失败: ${e}`);
                            toast.error(`标记审批失败: ${String(e)}`);
                        } finally {
                            setIsRunning(false);
                            setCurrentOperation('idle');
                        }
                    }}
                    onBatchPostEdit={handleBatchPostEdit}
                />
            </div>
            <BatchProgressDialog
                open={batchOpen}
                onOpenChange={setBatchOpen}
                jobId={batchJobId}
                percent={batchProgress}
                onCancel={async () => {
                    try {
                        setBatchOpen(false);
                        batchCancelRef.current = true;
                        const id = batchJobId;
                        setBatchJobId(undefined);
                        if (id) {
                            if (id.startsWith('qa.')) {
                                await fetch('/api/batch-quality-assure/cancel', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ batchId: id }),
                                });
                            } else if (id.startsWith('bt:')) {
                                // 预译批处理取消保留原有逻辑（如有需要可补充）
                                const { cancelJobAction } = await import('@/actions/job');
                                await cancelJobAction(id);
                            }
                        }
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
