// 动作部分：包含预翻译、质量评估、译后编辑等
import { useTranslationState, useTranslationContent } from "@/hooks/useTranslation";
import { useSourceEditor, useTargetEditor } from "@/hooks/useEditor";
import { toast } from "sonner";
import { TranslateMenu } from "./components/translate-menu";
import { QualityMenu } from "./components/quality-menu";
import { PostEditMenu } from "./components/post-edit-menu";
import { SignoffMenu } from "./components/signoff-menu";
import { ReviewMenu } from "./components/review-menu";
import { RunMenu } from "./components/run-menu";
import { extractMonolingualTermsAction, lookupDictionaryAction, embedAndTranslateAction, runPreTranslateAction } from "@/actions/pre-translate";
// 改为通过 API 路由调用，避免前端解析服务端依赖
import { extractBilingualSyntaxMarkersAction, evaluateSyntaxAction, embedSyntaxAdviceAction, runQualityAssureAction } from "@/actions/quality-assure";
// 改为通过 API 路由调用，避免前端解析服务端依赖
import { savePreTranslateResultsAction, saveQualityAssureResultsAction } from "@/actions/intermediate-results";
import { useTranslationLanguage } from "@/hooks/useTranslation";
import { useChatbarContent, useChatbarStream, useRightPanel } from "@/hooks/useRightPanel";

import { useLogger } from '@/hooks/useLogger';
import { useAgentWorkflowSteps } from '@/hooks/useAgentWorkflowSteps';
import { Message } from "@/types/chat";
import { useEffect, useRef, useState } from "react";
import { getLanguageByCode, getLanguageLabelByCode } from "@/utils/translate";
import { useExplorerTabs } from "@/hooks/useExplorerTabs";
import type { DocumentItemTab } from "@/types/explorerTabs";
import { getContentByIdAction, updateTranslationAction, updateDocItemStatusAction } from "@/actions/document-item";
import { recordGoToNextTranslationProcessEventAction } from "@/actions/translation-process-event";

import { useActiveDocumentItem } from "@/hooks/useActiveDocumentItem";
import { useRunningState } from "@/hooks/useRunning";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useSession } from "next-auth/react";
import { useLocale } from "next-intl";
import BatchProgressDialog from "./components/batch-progress-dialog";
import { useState as useReactState } from "react";
import { KeyboardShortcutsDialog, type ShortcutItem } from "../keyboard-shortcuts-dialog";
import { PreferencesDialog } from "../preferences-dialog";

export function ActionSection() {
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

    const { sourceText, targetText, setSourceTranslationText, setTargetTranslationText } = useTranslationContent();
    const targetEditor = useTargetEditor();
    const { explorerTabs, setExplorerTabs } = useExplorerTabs();
    const [batchProgress, setBatchProgress] = useState<number | undefined>(undefined);
    const [batchOpen, setBatchOpen] = useState(false);
    const [progressTitle, setProgressTitle] = useState<string>("");
    const [batchJobId, setBatchJobId] = useState<string | undefined>(undefined);
    const batchCancelRef = useRef(false);
    const [mounted, setMounted] = useState(false);
    const autoRunFlags = useRef<Record<string, boolean>>({});
    const [currentOperation, setCurrentOperation] = useState<'idle' | 'translate_single' | 'translate_batch' | 'evaluate_single' | 'evaluate_batch' | 'post_edit'>('idle');
    const { activeDocumentItem, setActiveDocumentItem } = useActiveDocumentItem();
    const { settings } = useUserSettings();
    const chosenProvider = settings.provider || 'openai';

    // 快捷键对话框
    const [shortcutsOpen, setShortcutsOpen] = useReactState(false);
    const [preferencesOpen, setPreferencesOpen] = useReactState(false);
    const shortcuts: ShortcutItem[] = [
        { id: 'batchTranslate', combo: '⌘B' },
        { id: 'batchEvaluate', combo: '⌘E' },
        { id: 'batchPostEdit', combo: '⌘P' },
        { id: 'batchSignoff', combo: '⌘⇧S' },
        { id: 'openShortcuts', combo: '⌘/' },
        { id: 'rollback', combo: '⌘[' },
        { id: 'advance', combo: '⌘]' },
    ];

    useEffect(() => { setMounted(true); }, []);

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
            // 批处理进行中，不改动 active，避免跳动
            if (isRunning) return;
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
        } catch { }
    };

    const handleAutoRun = async (_currentStage: string) => {
        // 一步到签发：从当前分段起，顺序处理当前页签
        try {
            const tabs = explorerTabs?.documentTabs ?? [];
            const aid = (activeDocumentItem as any)?.id;
            const currentTab = tabs.find((t: any) => (t.items ?? []).some((it: any) => it.id === aid));
            const items: any[] = (currentTab?.items ?? []) as any[];
            if (!items.length) return;
            const startIdx = Math.max(0, items.findIndex((it: any) => it.id === aid));
            const queueItems = items.slice(startIdx);

            // 1) 预译（仅处理 NOT_STARTED）
            const needPre = queueItems.filter((it: any) => (it.status || 'NOT_STARTED') === 'NOT_STARTED').map((it: any) => it.id);
            if (needPre.length) {
                setProgressTitle('批量翻译中');
                setBatchProgress(0);
                setBatchOpen(true);
                setIsRunning(true);
                const startRes = await fetch('/api/batch-pre-translate/start', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ itemIds: needPre, sourceLanguage: getLanguageLabelByCode(sourceLanguage) || 'auto', targetLanguage: getLanguageLabelByCode(targetLanguage) || 'auto' })
                }).then(r => r.json());
                const { batchId } = startRes || {};
                if (batchId) {
                    let tries = 0;
                    // 轮询进度
                    // 最长 10 分钟
                    while (tries <= 600) {
                        tries += 1;
                        try {
                            const p = await fetch(`/api/batch-pre-translate/progress?batchId=${encodeURIComponent(batchId)}`).then(r => r.json());
                            setBatchProgress(p.percent);
                            if (p.percent >= 100) break;
                        } catch { }
                        await new Promise(res => setTimeout(res, 1000));
                    }
                    try { await fetch('/api/batch-pre-translate/persist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batchId }) }); } catch { }
                }
                setBatchOpen(false);
            }

            // 2) 质检（处理非 SIGN_OFF 且 非 QA 的条目）
            const needQA = queueItems.filter((it: any) => (it.status || 'NOT_STARTED') !== 'SIGN_OFF' && (it.status || 'NOT_STARTED') !== 'QA').map((it: any) => it.id);
            if (needQA.length) {
                setProgressTitle('批量评估中');
                setBatchProgress(0);
                setBatchOpen(true);
                setIsRunning(true);
                const startQARes = await fetch('/api/batch-quality-assure/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemIds: needQA, targetLanguage: getLanguageLabelByCode(targetLanguage) || 'auto' }) }).then(r => r.json());
                const { batchId: qaId } = startQARes || {};
                if (qaId) {
                    let tries = 0;
                    while (tries <= 600) {
                        tries += 1;
                        try {
                            const p = await fetch(`/api/batch-quality-assure/progress?batchId=${encodeURIComponent(qaId)}`).then(r => r.json());
                            setBatchProgress(p.percent);
                            if (p.percent >= 100) break;
                        } catch { }
                        await new Promise(res => setTimeout(res, 1000));
                    }
                    try { await fetch('/api/batch-quality-assure/persist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batchId: qaId }) }); } catch { }
                }
                setBatchOpen(false);
            }

            // 3) 译后（标记 POST_EDIT）
            setProgressTitle('批量译后中');
            setBatchProgress(0);
            setBatchOpen(true);
            setIsRunning(true);
            let donePE = 0; const totalPE = queueItems.length;
            for (const it of queueItems) {
                if (it.status !== 'POST_EDIT' && it.status !== 'SIGN_OFF') {
                    try { await updateDocItemStatusAction(it.id, 'POST_EDIT'); } catch { }
                }
                donePE += 1; setBatchProgress(Math.round((donePE / totalPE) * 100));
            }
            try { if ((activeDocumentItem as any)?.id) await updateDocItemStatusAction((activeDocumentItem as any)?.id, 'POST_EDIT'); } catch { }

            // 4) 签发（标记 SIGN_OFF）}
            setProgressTitle('批量签发中');
            setBatchProgress(0);
            setBatchOpen(true);
            setIsRunning(true);
            let doneSG = 0; const totalSG = queueItems.length;
            for (const it of queueItems) {
                if (it.status !== 'SIGN_OFF') {
                    try { await updateDocItemStatusAction(it.id, 'SIGN_OFF'); } catch { }
                }
                doneSG += 1; setBatchProgress(Math.round((doneSG / totalSG) * 100));
            }
            try { if ((activeDocumentItem as any)?.id) await updateDocItemStatusAction((activeDocumentItem as any)?.id, 'SIGN_OFF'); } catch { }
            // 刷新左侧视图
            try {
                const tabsRes = await fetch(`/api/explorer-tabs?projectId=${encodeURIComponent((explorerTabs as any)?.projectId || '')}`).then(r => r.json());
                setExplorerTabs(tabsRes);
            } catch { }
            setCurrentStage('SIGN_OFF' as any);
        } finally {
            setBatchOpen(false);
            setIsRunning(false);
            setCurrentOperation('idle');
        }
    };

    useEffect(() => {
        // console.log(sourceLanguage, targetLanguage);
    }, [sourceLanguage, targetLanguage]);

    const setPreRunning = useAgentWorkflowSteps((s: any) => s.setPreRunning);
    const setPreStep = useAgentWorkflowSteps((s: any) => s.setPreStep);
    const setPreOutputs = useAgentWorkflowSteps((s: any) => s.setPreOutputs);
    const setQARunning = useAgentWorkflowSteps((s: any) => s.setQARunning);
    const setQAStep = useAgentWorkflowSteps((s: any) => s.setQAStep);
    const setQAOutputs = useAgentWorkflowSteps((s: any) => s.setQAOutputs);

    const handlePreTranslationAction = async (provider: string = 'openai') => {
        try {
            logAgent('翻译开始');

            setIsRunning(true);
            setCurrentOperation('translate_single');

            setCurrentStage('MT');
            const currentText = sourceText;

            if (!currentText.trim()) {
                toast.error("请先输入要翻译的内容");
                return;
            }

            // 预翻译三步：单语术语提取 → 词典查询 → 术语嵌入
            try {
                setPreRunning(true);
                setPreStep('mono-term-extract');
                logAgent('预翻译 · 术语抽取');
                const terms = await extractMonolingualTermsAction(currentText, { prompt: undefined, locale: locale });
                setPreOutputs({ terms });

                setPreStep('dict-lookup');
                logAgent('预翻译 · 词典查询');
                // 使用抽取到的术语进行数据库词典多轮查询
                // 优先用术语查询；若术语为空，回退用全文前缀切分成若干 token 进行兜底查询
                let dict: any[] = [];
                const termList = (terms || []).map((x: any) => x.term).filter(Boolean);
                if (termList.length) {
                    // 将字符串数组转换为 TermCandidate 数组
                    const termCandidates = termList.slice(0, 50).map(term => ({ term, score: 1.0 }));
                    dict = await lookupDictionaryAction(termCandidates, { userId });
                } else {
                    const tokens = currentText.split(/[\s,.;，。；、]+/).filter(Boolean).slice(0, 10);
                    dict = await lookupDictionaryAction(tokens.map((x: any) => ({ term: x, score: 1.0 })), { userId });
                }
                setPreOutputs({ dict });

                setPreStep('term-embed-trans');
                logAgent('预翻译 · 术语嵌入');
                const embedded = await embedAndTranslateAction(
                    currentText,
                    getLanguageLabelByCode(sourceLanguage) || 'auto',
                    getLanguageLabelByCode(targetLanguage) || 'auto',
                    dict,
                    { locale: locale }
                );
                setPreOutputs({ translation: embedded });
            } finally {
                setPreRunning(false);
                setPreStep('idle');
            }

            // 主翻译
            logAgent(`开始翻译，源文本长度: ${currentText.length}字符`);
            const preResult = await runPreTranslateAction(
                currentText,
                getLanguageLabelByCode(sourceLanguage) || 'auto',
                getLanguageLabelByCode(targetLanguage) || 'auto',
                { prompt: undefined }
            );
            const translatedText = preResult?.translation || '';
            setPreOutputs({ terms: preResult.terms, dict: preResult.dict, translation: preResult.translation });
            setTargetTranslationText(translatedText);

            // 保存预翻译结果到数据库
            try {
                await savePreTranslateResultsAction((activeDocumentItem as any)?.id, {
                    terms: preResult.terms,
                    dict: preResult.dict,
                    embedded: preResult.translation,
                });
                logInfo('预翻译结果已保存到数据库');
            } catch (error) {
                logError(`保存预翻译结果失败: ${error}`);
            }

            // 无论编辑器是否存在都写入状态并同步本地视图
            try { await updateDocItemStatusAction((activeDocumentItem as any)?.id, 'MT'); } catch { }
            syncLocalStatusById((activeDocumentItem as any)?.id, 'MT');

            // 更新目标编辑器与提示
            if (targetEditor?.editor) {
                targetEditor.editor.commands.setContent(translatedText);
                toast.success("翻译完成：翻译已完成并更新到目标编辑器");
                logAgent("翻译完成");
            }
        } catch (error) {
            console.error("翻译失败:", error);
            toast.error("翻译失败：请检查网络连接或稍后再试");
            logError(`翻译失败: ${error}`);
        } finally {
            setIsRunning(false);
            setCurrentOperation('idle');
        }
    };

    const handleBatchTranslate = async () => {
        try {
            setCurrentOperation('translate_batch');
            const jid = `${(explorerTabs as any)?.projectId || 'proj'}:${Date.now()}`;
            setBatchJobId(jid);
            setProgressTitle('批量翻译中');
            setBatchOpen(true);
            batchCancelRef.current = false;
            const tabs = explorerTabs?.documentTabs ?? [];
            const allItems: DocumentItemTab[] = tabs.flatMap(t => t.items ?? []);
            const total = allItems.length;
            if (!total) {
                toast.error("没有可翻译的分段：请先在左侧加载文档");
                return;
            }

            setIsRunning(true);
            setCurrentStage('MT' as any);
            setBatchProgress(0);
            logInfo(`批量翻译开始（服务端并发）：共 ${total} 个分段`);

            // 交由服务端批处理高并发执行（减少前端瓶颈与限流）
            const itemIds = allItems.map(i => i.id);
            const startRes = await fetch('/api/batch-pre-translate/start', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemIds, sourceLanguage: getLanguageLabelByCode(sourceLanguage) || 'auto', targetLanguage: getLanguageLabelByCode(targetLanguage) || 'auto' })
            }).then(r => r.json());
            const { batchId, total: srvTotal } = startRes || {};
            if (!batchId) {
                setIsRunning(false);
                setBatchOpen(false);
                toast.error("批量翻译无法启动：没有有效的分段");
                return;
            }
            setBatchJobId(batchId);
            let tries = 0;
            const timer = setInterval(async () => {
                tries += 1;
                try {
                    const p = await fetch(`/api/batch-pre-translate/progress?batchId=${encodeURIComponent(batchId)}`).then(r => r.json());
                    setBatchProgress(p.percent);
                    if (p.percent >= 100) {
                        clearInterval(timer);
                        try { await fetch('/api/batch-pre-translate/persist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batchId }) }); } catch { }
                        setIsRunning(false);
                        setCurrentStage('MT' as any);
                        setBatchOpen(false);
                        setCurrentOperation('idle');
                        if ((p.failed || 0) > 0) {
                            toast.warning(`批量翻译完成，但有失败项：成功 ${p.done}，失败 ${p.failed}`);
                        } else {
                            toast.success(`批量翻译完成：全部成功（${p.done}/${p.total}）`);
                        }
                        // 刷新左侧 explorerTabs
                        try {
                            const tabs = await fetch(`/api/explorer-tabs?projectId=${encodeURIComponent((explorerTabs as any)?.projectId || '')}`).then(r => r.json());
                            setExplorerTabs(tabs);
                        } catch { }
                        setBatchJobId(undefined);
                    }
                } catch { }
                if (tries > 600) {
                    clearInterval(timer);
                    setBatchOpen(false);
                    setIsRunning(false);
                    setCurrentOperation('idle');
                    toast.error("批量翻译超时：请稍后在日志中查看进度");
                    setBatchJobId(undefined);
                }
            }, 1000);
        } catch (e) {
            console.error('批量翻译启动或轮询失败:', e);
            setIsRunning(false);
            setCurrentOperation('idle');
            setBatchOpen(false);
            toast.error(`批量翻译失败：${String(e)}`);
        }
    };

    const evaluateCurrentTranslation = async (provider: string = 'openai') => {
        try {
            setIsRunning(true);
            setCurrentOperation('evaluate_single');
            setCurrentStage('QA' as any);
            const currentSourceText = sourceText;
            // 优先使用预翻译产出的嵌入译文作为候选译文进行术语对齐
            const preTranslation = useAgentWorkflowSteps()?.preTranslateEmbedded as string | undefined;
            const currentTargetText = preTranslation || targetText;
            if (!currentSourceText.trim() && !currentTargetText.trim()) {
                toast.error("翻译评估的内容不能为空：请先输入要翻译的内容");
                return;
            }

            // 记录翻译质检操作
            logAgent(`开始翻译质检，文本总长度: ${currentSourceText.length + currentTargetText.length} 字符`);

            // // 切换到聊天面板
            // if (mode !== 'chat') setMode('chat');


            // 质检两步：双语术语评估 → 句法特征评估 (移除语篇改写，放到 post-edit)
            try {
                setQARunning(true);

                // 使用新的 runQualityAssureAction 统一执行质检流程
                const result = await runQualityAssureAction(
                    currentSourceText || "",
                    currentTargetText || "",
                    {
                        targetLanguage,
                        domain: undefined,
                        projectId: undefined,
                        locale: locale
                    }
                );

                // 更新 useAgentWorkflowSteps 状态 (只保留 biTerm 和 syntax)
                setQAOutputs({
                    biTerm: result?.biTerm,
                    syntax: result?.syntax,
                });

            } finally {
                setQARunning(false);
                setQAStep('idle');
            }

            // 保存质检结果到数据库
            try {
                const qaState = useAgentWorkflowSteps();
                await saveQualityAssureResultsAction((activeDocumentItem as any)?.id, {
                    biTerm: qaState.qualityAssureBiTerm,
                    syntax: qaState.qualityAssureSyntax,
                    syntaxEmbedded: qaState.qualityAssureSyntaxEmbedded,
                });
                logInfo('质检结果已保存到数据库');
            } catch (error) {
                logError(`保存质检结果失败: ${error}`);
            }

            // 质检结果目前不覆盖译文，仅更新状态与面板数据

            // 无论编辑器是否存在都写入状态并同步本地视图
            if (activeDocumentItem?.id) {
                try { await updateDocItemStatusAction(activeDocumentItem.id, 'QA'); } catch { }
                syncLocalStatusById(activeDocumentItem.id, 'QA');
            }

            // 更新目标编辑器与提示
            if (targetEditor?.editor) {
                toast.success("评估完成：翻译质检已完成");
                logInfo("翻译质检完成");
            }
        } catch (error) {
            console.error("评估失败:", error);
            toast.error("评估失败：请检查网络连接或稍后再试");
            logError(`评估失败: ${error}`);
            addMessage({ content: `评估失败: ${error}`, role: 'system' });
        } finally {
            setIsRunning(false);
            setCurrentOperation('idle');
        }
    };

    const handleBatchEvaluate = async () => {
        try {
            setCurrentOperation('evaluate_batch');
            const tabs = explorerTabs?.documentTabs ?? [];
            const allItems: DocumentItemTab[] = tabs.flatMap(t => t.items ?? []);
            const total = allItems.length;
            if (!total) {
                toast.error("没有可评估的分段：请先在左侧加载文档");
                return;
            }

            setIsRunning(true);
            setCurrentStage('QA' as any);
            setBatchProgress(0);
            setProgressTitle('批量评估中');
            setBatchOpen(true);

            const itemIds = allItems.map(i => i.id);
            const startQARes = await fetch('/api/batch-quality-assure/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemIds, targetLanguage: getLanguageLabelByCode(targetLanguage) || 'auto' }) }).then(r => r.json());
            const { batchId, total: srvTotal } = startQARes || {};
            if (!batchId) {
                setIsRunning(false);
                setBatchOpen(false);
                toast.error("批量评估无法启动：没有有效的分段");
                return;
            }
            setBatchJobId(batchId);

            // 轮询进度
            let tries = 0;
            const timer = setInterval(async () => {
                tries += 1;
                try {
                    const p = await fetch(`/api/batch-quality-assure/progress?batchId=${encodeURIComponent(batchId)}`).then(r => r.json());
                    setBatchProgress(p.percent);
                    if (p.percent >= 100) {
                        clearInterval(timer);
                        try { await fetch('/api/batch-quality-assure/persist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batchId }) }); } catch { }
                        setIsRunning(false);
                        setCurrentStage('QA' as any);
                        setBatchOpen(false);
                        setCurrentOperation('idle');
                        if ((p.failed || 0) > 0) {
                            toast.warning(`批量评估完成，但有失败项：成功 ${p.done}，失败 ${p.failed}`);
                        } else {
                            toast.success(`批量评估完成：全部成功（${p.done}/${p.total}）`);
                        }
                        // 刷新左侧 explorerTabs
                        try {
                            const tabs = await fetch(`/api/explorer-tabs?projectId=${encodeURIComponent((explorerTabs as any)?.projectId || '')}`).then(r => r.json());
                            setExplorerTabs(tabs);
                        } catch { }
                        setBatchJobId(undefined);
                    }
                } catch { }
                if (tries > 600) { // 最长 10 分钟
                    clearInterval(timer);
                    setBatchOpen(false);
                    setIsRunning(false);
                    setCurrentOperation('idle');
                    toast.error("批量评估超时：请稍后在日志中查看进度");
                    setBatchJobId(undefined);
                }
            }, 1000);
        } catch (e) {
            setIsRunning(false);
            setBatchOpen(false);
            setCurrentOperation('idle');
            toast.error(`批量评估启动失败：${String(e)}`);
        }
    };

    // 提取批量签发逻辑，便于快捷键和菜单复用
    const batchSignoff = async () => {
        try {
            const tabs = explorerTabs?.documentTabs ?? [];
            const aid = (activeDocumentItem as any)?.id;
            const currentTab = tabs.find((t: any) => (t.items ?? []).some((it: any) => it.id === aid));
            const items: any[] = (currentTab?.items ?? []) as any[];
            if (!items.length) return;
            setProgressTitle('批量签发中');
            setBatchProgress(0);
            setBatchOpen(true);
            setIsRunning(true);
            setCurrentOperation('post_edit');
            let done = 0;
            const total = items.length;
            for (const it of items) {
                if (it.status !== 'SIGN_OFF') {
                    try {
                        await updateDocItemStatusAction(it.id, 'SIGN_OFF');
                        // 创建 Sign-off 事件记录
                        await recordGoToNextTranslationProcessEventAction(it.id, 'SIGN_OFF', 'HUMAN', 'SUCCESS');
                        // 创建 Completed 事件记录
                        await recordGoToNextTranslationProcessEventAction(it.id, 'COMPLETED', 'HUMAN', 'SUCCESS');
                    } catch { }
                }
                done += 1;
                setBatchProgress(Math.round((done / total) * 100));
            }
            try {
                if ((activeDocumentItem as any)?.id) {
                    await updateDocItemStatusAction((activeDocumentItem as any)?.id, 'SIGN_OFF');
                    // 为当前激活项也创建事件记录（如果还没有的话）
                    await recordGoToNextTranslationProcessEventAction((activeDocumentItem as any)?.id, 'SIGN_OFF', 'HUMAN', 'SUCCESS');
                    await recordGoToNextTranslationProcessEventAction((activeDocumentItem as any)?.id, 'COMPLETED', 'HUMAN', 'SUCCESS');
                }
            } catch { }
            setExplorerTabs((prev: any) => {
                if (!prev?.documentTabs) return prev;
                return {
                    ...prev,
                    documentTabs: prev.documentTabs.map((tab: any) => ({
                        ...tab,
                        items: (tab.items ?? []).map((it: any) => {
                            const inCurrent = (currentTab?.items ?? []).some((x: any) => x.id === it.id);
                            return inCurrent ? { ...it, status: 'SIGN_OFF' } : it;
                        }),
                    })),
                };
            });
            setCurrentStage('SIGN_OFF' as any);
            setBatchProgress(100);
            setBatchOpen(false);
        } finally {
            setIsRunning(false);
            setCurrentOperation('idle');
        }
    };

    // 前一步（回退）/后一步（前进） - 针对当前激活分段
    const rollbackCurrent = async () => {
        const id = (activeDocumentItem as any)?.id;
        if (!id) return;
        const mapping: Record<string, { to?: string; prev?: string }> = {
            'QA': { to: 'MT', prev: 'MT' },
            'POST_EDIT': { to: 'QA', prev: 'QA' },
            'COMPLETED': { to: 'POST_EDIT', prev: 'POST_EDIT' },
        };
        const m = mapping[currentStage as string];
        if (!m?.to) return;
        try {
            await updateDocItemStatusAction(id, m.to);
            if (m.prev) setCurrentStage(m.prev as any);
        } catch { }
    };

    const advanceCurrent = async () => {
        const id = (activeDocumentItem as any)?.id;
        if (!id) return;
        const mapping: Record<string, { to?: string; next?: string }> = {
            'MT': { to: 'QA', next: 'QA' },
            'QA': { to: 'POST_EDIT', next: 'POST_EDIT' },
            'POST_EDIT': { to: 'COMPLETED', next: 'COMPLETED' },
        };
        const m = mapping[currentStage as string];
        if (!m?.to) return;
        try {
            await updateDocItemStatusAction(id, m.to);
            if (m.next) setCurrentStage(m.next as any);
        } catch { }
    };

    // 全局快捷键：⌘B 批量预译；⌘E 批量评估；⌘⇧S 批量签发
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            const isMeta = e.metaKey || e.ctrlKey;
            if (!isMeta || isRunning) return;
            const key = e.key.toLowerCase();
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
                // 调用批量译后编辑
                // TODO: 需要实现批量译后编辑功能
                console.log('批量译后编辑快捷键触发');
                return;
            }
            // ⌘⇧S
            if ((e.shiftKey && key === 's')) {
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
            if (e.key === '[') {
                e.preventDefault();
                // 调用“前一步/回退阶段”
                const id = (activeDocumentItem as any)?.id;
                if (!id) return;
                const mapping: Record<string, { to?: string; prev?: string }> = {
                    'QA': { to: 'MT', prev: 'MT' },
                    'POST_EDIT': { to: 'QA', prev: 'QA' },
                    'COMPLETED': { to: 'POST_EDIT', prev: 'POST_EDIT' },
                };
                const m = mapping[currentStage as string];
                if (m?.to) {
                    updateDocItemStatusAction(id, m.to).then(() => {
                        if (m.prev) setCurrentStage(m.prev as any);
                    }).catch(() => { });
                }
                return;
            }
            // ⌘]
            if (e.key === ']') {
                e.preventDefault();
                // 调用“后一步/推进阶段”
                const id = (activeDocumentItem as any)?.id;
                if (!id) return;
                const mapping: Record<string, { to?: string; next?: string }> = {
                    'MT': { to: 'QA', next: 'QA' },
                    'QA': { to: 'POST_EDIT', next: 'POST_EDIT' },
                    'POST_EDIT': { to: 'COMPLETED', next: 'COMPLETED' },
                };
                const m = mapping[currentStage as string];
                if (m?.to) {
                    updateDocItemStatusAction(id, m.to).then(() => {
                        if (m.next) setCurrentStage(m.next as any);
                    }).catch(() => { });
                }
                return;
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isRunning, handleBatchTranslate, /* stable deps */]);

    const handleEvaluateMode = (modeSel: 'single' | 'batch') => {
        if (modeSel === 'single') return evaluateCurrentTranslation(chosenProvider);
        return handleBatchEvaluate();
    };

    const postEditCurrentContent = async () => {
        console.log("译后编辑");
        setCurrentOperation('post_edit');
        setIsRunning(true);
        // try { await 
        //     try { await updateDocItemStatusAction(activeDocumentItem.id, 'QA'); } catch {}((activeDocumentItem as any)?.id, 'POST_EDIT'); } catch {}
        // try { await updateDocumentTranslateStatusByItemId((activeDocumentItem as any)?.id, 'POST_EDIT'); } catch {}
        setIsRunning(false);
        setCurrentOperation('idle');
    };

    // 一步到签发：从当前分段所在页签，依次预译→评估→译后→签发
    const runToSignoffFromCurrent = async () => {
        try {
            const tabs = explorerTabs?.documentTabs ?? [];
            const aid = (activeDocumentItem as any)?.id;
            const currentTab = tabs.find((t: any) => (t.items ?? []).some((it: any) => it.id === aid));
            const items: any[] = (currentTab?.items ?? []) as any[];
            if (!items.length) {
                toast.error('没有可处理的分段：请先在左侧加载文档');
                return;
            }
            const itemIds = items.map(i => i.id);

            setIsRunning(true);
            setCurrentOperation('translate_batch');
            setProgressTitle('批量预译中');
            setBatchProgress(0);
            setBatchOpen(true);

            // 1) 批量预译
            try {
                const startRes = await fetch('/api/batch-pre-translate/start', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ itemIds, sourceLanguage: getLanguageLabelByCode(sourceLanguage) || 'auto', targetLanguage: getLanguageLabelByCode(targetLanguage) || 'auto' })
                }).then(r => r.json());
                const { batchId } = startRes || {};
                if (batchId) {
                    let tries = 0;
                    while (tries < 600) {
                        tries += 1;
                        try {
                            const p = await fetch(`/api/batch-pre-translate/progress?batchId=${encodeURIComponent(batchId)}`).then(r => r.json());
                            setBatchProgress(p.percent);
                            if (p.percent >= 100) break;
                        } catch { }
                        await new Promise(res => setTimeout(res, 1000));
                    }
                    try { await fetch('/api/batch-pre-translate/persist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batchId }) }); } catch { }
                }
            } catch { }

            // 2) 批量评估
            setCurrentOperation('evaluate_batch');
            setProgressTitle('批量评估中');
            setBatchProgress(0);
            try {
                const startQARes = await fetch('/api/batch-quality-assure/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemIds, targetLanguage: getLanguageLabelByCode(targetLanguage) || 'auto' }) }).then(r => r.json());
                const { batchId } = startQARes || {};
                if (batchId) {
                    let tries = 0;
                    while (tries < 600) {
                        tries += 1;
                        try {
                            const p = await fetch(`/api/batch-quality-assure/progress?batchId=${encodeURIComponent(batchId)}`).then(r => r.json());
                            setBatchProgress(p.percent);
                            if (p.percent >= 100) break;
                        } catch { }
                        await new Promise(res => setTimeout(res, 1000));
                    }
                    try { await fetch('/api/batch-quality-assure/persist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batchId }) }); } catch { }
                }
            } catch { }

            // 3) 标记译后→签发（当前页签）
            setProgressTitle('批量签发中');
            setCurrentOperation('post_edit');
            let done = 0; const total = items.length;
            for (const it of items) {
                try { await updateDocItemStatusAction(it.id, 'POST_EDIT'); } catch { }
                try { await updateDocItemStatusAction(it.id, 'SIGN_OFF'); } catch { }
                done += 1; setBatchProgress(Math.round((done / total) * 100));
            }
            try { if ((activeDocumentItem as any)?.id) await updateDocItemStatusAction((activeDocumentItem as any)?.id, 'SIGN_OFF'); } catch { }
            // 本地同步（仅当前页签）
            setExplorerTabs((prev: any) => {
                if (!prev?.documentTabs) return prev;
                return {
                    ...prev,
                    documentTabs: prev.documentTabs.map((tab: any) => ({
                        ...tab,
                        items: (tab.items ?? []).map((it: any) => {
                            const inCurrent = (currentTab?.items ?? []).some((x: any) => x.id === it.id);
                            return inCurrent ? { ...it, status: 'SIGN_OFF' } : it;
                        }),
                    })),
                };
            });
            setCurrentStage('SIGN_OFF' as any);
            setBatchProgress(100);
            setBatchOpen(false);
            toast.success(`一步到签发完成：共处理 ${items.length} 条`);
        } catch (e) {
            toast.error(`一步到签发失败：${String(e)}`);
        } finally {
            setIsRunning(false);
            setCurrentOperation('idle');
        }
    };

    if (!mounted) {
        return null;
    }

    return (
        <div className="w-full">
            <div className="flex items-center justify-start w-full">
                <RunMenu
                    isRunning={isRunning}
                    currentStage={currentStage}
                    setIsRunning={setIsRunning}
                    onTranslationAction={() => runToSignoffFromCurrent()}
                    mounted={mounted}
                />
                <TranslateMenu
                    isTranslating={isRunning && (currentOperation === 'translate_single' || currentOperation === 'translate_batch')}
                    onTranslate={handlePreTranslationAction}
                    onBatchTranslate={handleBatchTranslate}
                    progressPercent={batchProgress}
                />
                <QualityMenu
                    isTranslating={isRunning && (currentOperation === 'evaluate_single' || currentOperation === 'evaluate_batch')}
                    onEvaluate={handleEvaluateMode}
                    progressPercent={batchProgress}
                />
                <PostEditMenu
                    isTranslating={isRunning && currentOperation === 'post_edit'}
                    canEnter={(explorerTabs?.documentTabs ?? []).flatMap(t => t.items ?? []).every((it: any) => it.status === 'QA')}
                    onMarkReviewed={async () => {
                        try {
                            if (!sourceText.trim() && !targetText.trim()) {
                                toast.error('没有可审批的内容：请先进行翻译或评估');
                                return;
                            }
                            setCurrentOperation('post_edit');
                            setIsRunning(true);
                            // 全部 DocItem 状态切为 POST_EDIT
                            const allItems: any[] = (explorerTabs?.documentTabs ?? []).flatMap(t => t.items ?? []);
                            for (const it of allItems) {
                                try { await updateDocItemStatusAction(it.id, 'POST_EDIT'); } catch { }
                            }
                            try {
                                // 根据当前激活项，更新所属文档与全局阶段
                                if ((activeDocumentItem as any)?.id) {
                                    await updateDocItemStatusAction((activeDocumentItem as any)?.id, 'POST_EDIT');
                                }
                            } catch { }
                            // 本地同步标签
                            setExplorerTabs((prev: any) => {
                                if (!prev?.documentTabs) return prev;
                                return {
                                    ...prev,
                                    documentTabs: prev.documentTabs.map((tab: any) => ({
                                        ...tab,
                                        items: (tab.items ?? []).map((it: any) => ({ ...it, status: 'POST_EDIT' })),
                                    })),
                                };
                            });
                            logInfo('已进入译后编辑（全部分段状态已更新）');
                        } catch (e) {
                            logError(`标记审批失败: ${e}`);
                        } finally {
                            setIsRunning(false);
                            setCurrentOperation('idle');
                        }
                    }}
                    onBatchPostEdit={async () => {
                        try {
                            const tabs = explorerTabs?.documentTabs ?? [];
                            const allItems: DocumentItemTab[] = tabs.flatMap(t => t.items ?? []);
                            const total = allItems.length;
                            if (!total) {
                                toast.error("没有可编辑的分段：请先在左侧加载文档");
                                return;
                            }

                            setIsRunning(true);
                            setCurrentOperation('post_edit');
                            setProgressTitle('批量译后编辑中');
                            setBatchProgress(0);
                            setBatchOpen(true);
                            logInfo(`批量译后编辑开始：共 ${total} 个分段`);

                            let done = 0;
                            for (const it of allItems) {
                                if (it.status !== 'POST_EDIT' && it.status !== 'SIGN_OFF') {
                                    try { await updateDocItemStatusAction(it.id, 'POST_EDIT'); } catch { }
                                }
                                done += 1;
                                setBatchProgress(Math.round((done / total) * 100));
                            }

                            // 刷新左侧视图
                            try {
                                const tabsRes = await fetch(`/api/explorer-tabs?projectId=${encodeURIComponent((explorerTabs as any)?.projectId || '')}`).then(r => r.json());
                                setExplorerTabs(tabsRes);
                            } catch { }

                            setBatchOpen(false);
                            toast.success(`批量译后编辑完成：共处理 ${total} 个分段`);
                        } catch (e) {
                            toast.error(`批量译后编辑失败：${String(e)}`);
                        } finally {
                            setIsRunning(false);
                            setCurrentOperation('idle');
                        }
                    }} />
                {/* 签发菜单（与其他按钮同一行显示） */}
                <SignoffMenu
                    isRunning={isRunning}
                    canSignoffCurrent={(activeDocumentItem as any)?.status === 'POST_EDIT'}
                    canBatchSignoff={(() => {
                        const tabs = explorerTabs?.documentTabs ?? [];
                        const aid = (activeDocumentItem as any)?.id;
                        const tab = tabs.find((t: any) => (t.items ?? []).some((it: any) => it.id === aid));
                        const items = (tab?.items ?? []) as any[];
                        const allEligible = items.every((it: any) => it.status === 'POST_EDIT' || it.status === 'SIGN_OFF');
                        const hasPending = items.some((it: any) => it.status === 'POST_EDIT');
                        return items.length > 0 && allEligible && hasPending;
                    })()}
                    onSignoffCurrent={async () => {
                        try {
                            const id = (activeDocumentItem as any)?.id;
                            if (!id) return;
                            setIsRunning(true);
                            setCurrentOperation('post_edit');
                            try {
                                await updateDocItemStatusAction(id, 'SIGN_OFF');
                                // 创建 Sign-off 事件记录
                                await recordGoToNextTranslationProcessEventAction(id, 'SIGN_OFF', 'HUMAN', 'SUCCESS');
                                // 创建 Completed 事件记录
                                await recordGoToNextTranslationProcessEventAction(id, 'COMPLETED', 'HUMAN', 'SUCCESS');
                            } catch { }
                            setExplorerTabs((prev: any) => {
                                if (!prev?.documentTabs) return prev;
                                return {
                                    ...prev,
                                    documentTabs: prev.documentTabs.map((tab: any) => ({
                                        ...tab,
                                        items: (tab.items ?? []).map((it: any) => (it.id === id ? { ...it, status: 'SIGN_OFF' } : it)),
                                    })),
                                };
                            });
                            setCurrentStage('SIGN_OFF' as any);
                        } finally {
                            setIsRunning(false);
                            setCurrentOperation('idle');
                        }
                    }}
                    onBatchSignoff={batchSignoff}
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
                            if (id.startsWith('qa:')) {
                                await fetch('/api/batch-quality-assure/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batchId: id }) });
                            } else if (id.startsWith('bt:')) {
                                // 预译批处理取消保留原有逻辑（如有需要可补充）
                                const { cancelJobAction } = await import('@/actions/job');
                                await cancelJobAction(id);
                            }
                        }
                    } catch { }
                }}
                title={progressTitle || "批量处理中"}
            />
            <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} items={shortcuts} />
            <PreferencesDialog open={preferencesOpen} onOpenChange={setPreferencesOpen} />
        </div>
    );
}