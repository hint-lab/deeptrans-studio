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
    // 在组件顶层获取所有需要的状态
    const { 
        preTranslateEmbedded,
        qualityAssureBiTerm,
        qualityAssureSyntax,
        qualityAssureSyntaxEmbedded 
    } = useAgentWorkflowSteps();
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
    { id: 'batchTranslate', combo: '⌘B', description: '批量翻译未开始分段' },
    { id: 'batchEvaluate', combo: '⌘E', description: '批量质检预翻译复核分段' },
    { id: 'batchPostEdit', combo: '⌘P', description: '批量译后编辑' },
    { id: 'batchSignoff', combo: '⌘⇧S', description: '批量签发' },
    { id: 'openShortcuts', combo: '⌘/', description: '打开快捷键' },
    { id: 'rollback', combo: '⌘[', description: '回退阶段' },
    { id: 'advance', combo: '⌘]', description: '前进阶段' },];

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
                    body: JSON.stringify({ itemIds: needPre, sourceLanguage: sourceLanguage || 'auto', targetLanguage: targetLanguage || 'auto' })
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
                const startQARes = await fetch('/api/batch-quality-assure/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemIds: needQA, targetLanguage: targetLanguage || 'auto' }) }).then(r => r.json());
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
            // 5) 完成（标记 COMPLETED）
            setProgressTitle('批量完成中');
            setBatchProgress(0);
            setBatchOpen(true);
            setIsRunning(true);
            let doneSG1 = 0; const totalSG1 = queueItems.length;
            for (const it of queueItems) {
              if (it.status !== 'COMPLETED') {
                try { 
                  await updateDocItemStatusAction(it.id, 'COMPLETED'); 
                  await recordGoToNextTranslationProcessEventAction(it.id,'COMPLETED', 'HUMAN', 'SUCCESS');
                } catch { }
              }
              doneSG1 += 1; setBatchProgress(Math.round((doneSG1 / totalSG1) * 100));
            }
            try { 
              if ((activeDocumentItem as any)?.id) {
                await updateDocItemStatusAction((activeDocumentItem as any)?.id,        'COMPLETED'); 
                await recordGoToNextTranslationProcessEventAction((activeDocumentItem           as any)?.id, 'COMPLETED', 'HUMAN', 'SUCCESS');
              }
            } catch { }
  
            // 刷新左侧视图
            try {
              const tabsRes = await fetch(`/api/explorer-tabs?projectId=$    {encodeURIComponent((explorerTabs as any)?.projectId || '')}`).then(r =>r.json());
              setExplorerTabs(tabsRes);
            } catch { }
            setCurrentStage('COMPLETED' as any);
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
                    sourceLanguage || 'auto',
                    targetLanguage || 'auto',
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
                sourceLanguage || 'auto',
                targetLanguage || 'auto',
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
        const jid = `${(explorerTabs as any)?.projectId || 'proj'}.${Date.now()}`;
        setBatchJobId(jid);
        setProgressTitle('批量翻译中');
        setBatchOpen(true);
        batchCancelRef.current = false;
        const tabs = explorerTabs?.documentTabs ?? [];
        
        // 只获取未开始状态的分段
        const notStartedItems: DocumentItemTab[] = tabs.flatMap(t => 
            (t.items ?? []).filter((item: any) => 
                item.status === 'NOT_STARTED' || !item.status
            )
        );
        
        const total = notStartedItems.length;
        if (!total) {
            toast.error("没有需要翻译的分段：所有分段都已开始或完成");
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
                targetLanguage: targetLanguage || 'auto' 
            })
        }).then(r => r.json());
        
        const { batchId, total: srvTotal } = startRes || {};
        if (!batchId) {
            setIsRunning(false);
            setBatchOpen(false);
            setCurrentOperation('idle');
            toast.error("批量翻译无法启动：没有有效的未开始分段");
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
                    try { 
                        await fetch('/api/batch-pre-translate/persist', { 
                            method: 'POST', 
                            headers: { 'Content-Type': 'application/json' }, 
                            body: JSON.stringify({ batchId }) 
                        }); 
                    } catch { }
                    
                    setIsRunning(false);
                    setCurrentStage('MT' as any);
                    setBatchOpen(false);
                    setCurrentOperation('idle');
                    
                    if ((p.failed || 0) > 0) {
                        toast.warning(`批量翻译完成，但有失败项：成功 ${p.done}，失败 ${p.failed}`);
                    } else {
                        toast.success(`批量翻译完成：成功处理 ${p.done} 个未开始分段`);
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
        // 检查前置条件
        const id = (activeDocumentItem as any)?.id;
        if (!id) {
            toast.error("没有激活的文档项，无法进行质检");
            return;
        }

        // 检查当前状态是否允许质检（应该在 MT_REVIEW 状态）
        if (activeDocumentItem?.status !== 'MT_REVIEW') {
            toast.error(`当前分段状态为 ${activeDocumentItem?.status || '未知'}，无法进行质检。仅在预翻译复核阶段允许质检`);
            return;
        }

        // 检查文本内容
        const currentSourceText = sourceText;
        const preTranslation = preTranslateEmbedded as string | undefined;
        const currentTargetText = preTranslation || targetText;
        
        if (!currentSourceText.trim()) {
            toast.error("原文内容为空，无法进行质检");
            return;
        }
        
        if (!currentTargetText.trim()) {
            toast.error("译文内容为空，无法进行质检。请先完成预翻译");
            return;
        }

        setIsRunning(true);
        setCurrentOperation('evaluate_single');
        // 记录开始质检
        logAgent(`开始翻译质检，原文长度: ${currentSourceText.length}字符，译文长度: ${currentTargetText.length}字符`);

        // 质检两步：双语术语评估 → 句法特征评估
        try {
            setQARunning(true);
            setCurrentStage('QA' as any);
            setQAStep('bi-term-evaluate');

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

            // 更新 useAgentWorkflowSteps 状态
            setQAOutputs({
                biTerm: result?.biTerm,
                syntax: result?.syntax,
            });

            setQAStep('syntax-evaluate');
            
        } finally {
            setQARunning(false);
            setQAStep('idle');
        }

        // 保存质检结果到数据库
        try {
            const qaState = useAgentWorkflowSteps();
            await saveQualityAssureResultsAction(id, {
                biTerm: qaState.qualityAssureBiTerm,
                syntax: qaState.qualityAssureSyntax,
                syntaxEmbedded: qaState.qualityAssureSyntaxEmbedded,
            });
            logInfo('质检结果已保存到数据库');
        } catch (error) {
            logError(`保存质检结果失败: ${error}`);
            // 继续执行，不中断流程
        }

        // 更新状态：从 MT_REVIEW 到 QA_REVIEW
        try {
            // 1. 更新数据库状态
            await updateDocItemStatusAction(id, 'QA_REVIEW');
            
            // 2. 同步本地状态
            syncLocalStatusById(id, 'QA_REVIEW');
            
            // 3. 更新当前组件状态
            setCurrentStage('QA_REVIEW' as any);
            
            // 4. 记录质检完成事件
            await recordGoToNextTranslationProcessEventAction(id, 'QA', 'AGENT', 'SUCCESS');
            await recordGoToNextTranslationProcessEventAction(id, 'QA_REVIEW', 'HUMAN', 'SUCCESS');
            
            logInfo(`分段 ${id} 质检完成，状态更新为 QA_REVIEW`);
        } catch (error) {
            logError(`状态更新失败: ${error}`);
            // 继续执行，不中断流程
        }

        // 更新目标编辑器与提示
        if (targetEditor?.editor) {
            toast.success("质检完成：翻译质检已完成，请复核质检结果");
            logInfo("翻译质检完成，等待复核");
        } else {
            toast.success("质检完成：翻译质检已完成");
        }
        
    } catch (error: any) {
        console.error("质检失败:", error);
        
        // 提供更详细的错误信息
        let errorMessage = "质检失败：请检查网络连接或稍后再试";
        if (error.message?.includes('timeout')) {
            errorMessage = "质检超时：请检查网络连接或稍后重试";
        } else if (error.message?.includes('API')) {
            errorMessage = "质检API调用失败：请检查API配置";
        } else if (error.message?.includes('validation')) {
            errorMessage = "质检参数验证失败：请检查输入内容";
        }
        
        toast.error(errorMessage);
        logError(`质检失败: ${error.message || error}`);
        
        // 记录失败事件
        try {
            const id = (activeDocumentItem as any)?.id;
            if (id) {
                await recordGoToNextTranslationProcessEventAction(id, 'QA', 'AGENT', 'FAILED');
            }
        } catch (e) {
            // 忽略事件记录失败
        }
        
        // 添加到聊天面板
        addMessage({ 
            content: `质检失败: ${error.message || '未知错误'}`, 
            role: 'system'
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
            (t.items ?? []).filter((item: any) => 
                item.status === 'MT_REVIEW'
            )
        );
        
        const total = needEvaluateItems.length;
        if (!total) {
            toast.error("没有需要质检的分段：所有分段都已质检或未处于预翻译复核阶段");
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
                targetLanguage: targetLanguage || 'auto' 
            }) 
        }).then(r => r.json());
        
        const { batchId, total: srvTotal } = startQARes || {};
        if (!batchId) {
            setIsRunning(false);
            setBatchOpen(false);
            setCurrentOperation('idle');
            toast.error("批量质检无法启动：没有需要质检的分段");
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
                    try { 
                        await fetch('/api/batch-quality-assure/persist', { 
                            method: 'POST', 
                            headers: { 'Content-Type': 'application/json' }, 
                            body: JSON.stringify({ batchId }) 
                        }); 
                        // 批量更新状态到 QA_REVIEW
                        for (const item of needEvaluateItems) {
                            try {
                                await updateDocItemStatusAction(item.id, 'QA_REVIEW');
                                await recordGoToNextTranslationProcessEventAction(item.id, 'QA', 'AGENT', 'SUCCESS');
                                await recordGoToNextTranslationProcessEventAction(item.id,'QA_REVIEW', 'HUMAN', 'SUCCESS');
                            } catch (e) {
                                console.error(`更新分段 ${item.id} 状态失败:`, e);
                            }
                        }
                    } catch { }
                    
                    setIsRunning(false);
                    setCurrentStage('QA_REVIEW' as any);
                    setBatchOpen(false);
                    setCurrentOperation('idle');
                    
                    if ((p.failed || 0) > 0) {
                        toast.warning(`批量质检完成，但有失败项：成功 ${p.done}，失败 ${p.failed}`);
                    } else {
                        toast.success(`批量质检完成：成功处理 ${p.done} 个预翻译复核分段`);
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
                toast.error("批量质检超时：请稍后在日志中查看进度");
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
        const currentTab = tabs.find((t: any) => (t.items ?? []).some((it: any) => it.id === aid));
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
        setCurrentOperation('post_edit');
        
        let done = 0;
        for (const it of itemsToSignoff) {
            try {
                await updateDocItemStatusAction(it.id, 'SIGN_OFF');
                // 只记录 SIGN_OFF 事件
                await recordGoToNextTranslationProcessEventAction(it.id, 'SIGN_OFF', 'HUMAN', 'SUCCESS');
            } catch (e) {
                console.error(`签发分段 ${it.id} 失败:`, e);
            }
            done += 1;
            setBatchProgress(Math.round((done / totalToSignoff) * 100));
        }
        
        // 更新当前激活项（如果也在处理列表中）
        try {
            if ((activeDocumentItem as any)?.id) {
                const currentItem = itemsToSignoff.find((it: any) => it.id === (activeDocumentItem as any)?.id);
                if (currentItem) {
                    setCurrentStage('SIGN_OFF' as any);
                }
            }
        } catch { }
        
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
                                const shouldUpdate = itemsToSignoff.some((x: any) => x.id === it.id);
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

// 一步到完成：从当前分段所在页签，依次预译→评估→译后→完成
const runToCompletionFromCurrent = async () => {
  try {
    const tabs = explorerTabs?.documentTabs ?? [];
    const aid = (activeDocumentItem as any)?.id;
    const currentTab = tabs.find((t: any) => (t.items ?? []).some((it: any) => it.id === aid));
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

    setIsRunning(true);
    setCurrentOperation('translate_batch');
    setProgressTitle('批量预译中');
    setBatchProgress(0);
    setBatchOpen(true);

    // 1) 批量预译 - 只处理未开始的分段
    const needPreTranslateItems = itemsToProcess.filter((it: any) => 
      it.status === 'NOT_STARTED' || !it.status
    );
    
    if (needPreTranslateItems.length > 0) {
      const preTranslateIds = needPreTranslateItems.map(i => i.id);
      try {
        const startRes = await fetch('/api/batch-pre-translate/start', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            itemIds: preTranslateIds, 
            sourceLanguage: sourceLanguage || 'auto', 
            targetLanguage: targetLanguage || 'auto' 
          })
        }).then(r => r.json());
        const { batchId } = startRes || {};
        if (batchId) {
          let tries = 0;
          while (tries < 600) {
            tries += 1;
            try {
              const p = await fetch(`/api/batch-pre-translate/progress?batchId=${encodeURIComponent(batchId)}`).then(r => r.json());
              setBatchProgress(Math.round((p.percent * needPreTranslateItems.length) / totalToProcess));
              if (p.percent >= 100) break;
            } catch { }
            await new Promise(res => setTimeout(res, 1000));
          }
          try { 
            await fetch('/api/batch-pre-translate/persist', { 
              method: 'POST', 
              headers: { 'Content-Type': 'application/json' }, 
              body: JSON.stringify({ batchId }) 
            }); 
          } catch { }
        }
      } catch (error) {
        console.error('批量预译失败:', error);
      }
    }

    // 2) 批量评估 - 只处理需要评估的分段（MT状态）
    const needQaItems = itemsToProcess.filter((it: any) => 
      it.status === 'MT' || it.status === 'MT_REVIEW'
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
            targetLanguage: targetLanguage || 'auto' 
          }) 
        }).then(r => r.json());
        const { batchId } = startQARes || {};
        if (batchId) {
          let tries = 0;
          while (tries < 600) {
            tries += 1;
            try {
              const p = await fetch(`/api/batch-quality-assure/progress?batchId=${encodeURIComponent(batchId)}`).then(r => r.json());
              // 计算总进度：预译进度 + 评估进度
              const preTranslateProgress = needPreTranslateItems.length > 0 ? needPreTranslateItems.length : 0;
              const currentQaProgress = Math.round((p.percent * needQaItems.length) / totalToProcess);
              setBatchProgress(Math.round((preTranslateProgress + currentQaProgress) / totalToProcess * 100));
              if (p.percent >= 100) break;
            } catch { }
            await new Promise(res => setTimeout(res, 1000));
          }
          try { 
            await fetch('/api/batch-quality-assure/persist', { 
              method: 'POST', 
              headers: { 'Content-Type': 'application/json' }, 
              body: JSON.stringify({ batchId }) 
            }); 
          } catch { }
        }
      } catch (error) {
        console.error('批量评估失败:', error);
      }
    }

    // 3) 标记译后→签发→完成（当前页签）- 只处理需要推进的分段
    setProgressTitle('批量完成中');
    setCurrentOperation('post_edit');
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
          await recordGoToNextTranslationProcessEventAction(it.id, 'SIGN_OFF', 'HUMAN', 'SUCCESS');
          targetStatus = 'COMPLETED';
        }
        // 如果是QA或QA_REVIEW，先到POST_EDIT再到SIGN_OFF再到COMPLETED
        else if (it.status === 'QA' || it.status === 'QA_REVIEW') {
          await updateDocItemStatusAction(it.id, 'POST_EDIT');
          await recordGoToNextTranslationProcessEventAction(it.id, 'POST_EDIT', 'AGENT', 'SUCCESS');
          await updateDocItemStatusAction(it.id, 'SIGN_OFF');
          await recordGoToNextTranslationProcessEventAction(it.id, 'SIGN_OFF', 'HUMAN', 'SUCCESS');
          targetStatus = 'COMPLETED';
        }
        // 如果是MT或MT_REVIEW，需要先到QA再到POST_EDIT再到SIGN_OFF再到COMPLETED
        else if (it.status === 'MT' || it.status === 'MT_REVIEW') {
          // 这些应该已经在批量评估中处理过了，这里直接推进
          await updateDocItemStatusAction(it.id, 'QA');
          await recordGoToNextTranslationProcessEventAction(it.id, 'QA', 'AGENT', 'SUCCESS');
          await updateDocItemStatusAction(it.id, 'POST_EDIT');
          await recordGoToNextTranslationProcessEventAction(it.id, 'POST_EDIT', 'AGENT', 'SUCCESS');
          await updateDocItemStatusAction(it.id, 'SIGN_OFF');
          await recordGoToNextTranslationProcessEventAction(it.id, 'SIGN_OFF', 'HUMAN', 'SUCCESS');
          targetStatus = 'COMPLETED';
        }
        // 如果是NOT_STARTED，应该已经在批量预译中处理过了
        else if (it.status === 'NOT_STARTED' || !it.status) {
          await updateDocItemStatusAction(it.id, 'MT');
          await recordGoToNextTranslationProcessEventAction(it.id, 'MT', 'AGENT', 'SUCCESS');
          await updateDocItemStatusAction(it.id, 'QA');
          await recordGoToNextTranslationProcessEventAction(it.id, 'QA', 'AGENT', 'SUCCESS');
          await updateDocItemStatusAction(it.id, 'POST_EDIT');
          await recordGoToNextTranslationProcessEventAction(it.id, 'POST_EDIT', 'AGENT', 'SUCCESS');
          await updateDocItemStatusAction(it.id, 'SIGN_OFF');
          await recordGoToNextTranslationProcessEventAction(it.id, 'SIGN_OFF', 'HUMAN', 'SUCCESS');
          targetStatus = 'COMPLETED';
        }
        
        // 最终更新到COMPLETED
        await updateDocItemStatusAction(it.id, targetStatus);
        await recordGoToNextTranslationProcessEventAction(it.id, 'COMPLETED', 'HUMAN', 'SUCCESS');
        
      } catch (error) {
        console.error(`处理分段 ${it.id} 失败:`, error);
      }
      done += 1; 
      setBatchProgress(Math.round((done / totalToProcess) * 100));
    }
    
    // 更新当前激活项
    try { 
      if ((activeDocumentItem as any)?.id) {
        const currentItemStatus = items.find((it: any) => it.id === (activeDocumentItem as any)?.id)?.status;
        if (currentItemStatus !== 'COMPLETED') {
          await updateDocItemStatusAction((activeDocumentItem as any)?.id, 'COMPLETED'); 
          await recordGoToNextTranslationProcessEventAction((activeDocumentItem as any)?.id, 'COMPLETED', 'HUMAN', 'SUCCESS');
        }
      }
    } catch { }
    
    // 本地同步（仅当前页签）
    setExplorerTabs((prev: any) => {
      if (!prev?.documentTabs) return prev;
      return {
        ...prev,
        documentTabs: prev.documentTabs.map((tab: any) => ({
          ...tab,
          items: (tab.items ?? []).map((it: any) => {
            const inCurrent = (currentTab?.items ?? []).some((x: any) => x.id === it.id);
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
                    body: JSON.stringify({ itemIds, sourceLanguage:sourceLanguage|| 'auto', targetLanguage: targetLanguage || 'auto' })
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
                const startQARes = await fetch('/api/batch-quality-assure/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemIds, targetLanguage: targetLanguage || 'auto' }) }).then(r => r.json());
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
                    onTranslationAction={() => runToCompletionFromCurrent()}
                    mounted={mounted}
                />
                <TranslateMenu
                    isTranslating={isRunning && (currentOperation === 'translate_single' || currentOperation === 'translate_batch')}
                    canTranslate={(explorerTabs?.documentTabs ?? []).flatMap(t => t.items ?? []).some((it: any) => it.status === 'NOT_STARTED')}
                    onTranslate={handlePreTranslationAction}
                    onBatchTranslate={handleBatchTranslate}
                    progressPercent={batchProgress}
                />
                <QualityMenu
                    isTranslating={isRunning && (currentOperation === 'evaluate_single' || currentOperation === 'evaluate_batch')}
                    canQuality={(explorerTabs?.documentTabs ?? []).flatMap(t => t.items ?? []).some((it: any) => it.status === 'MT_REVIEW')}
                    onEvaluate={handleEvaluateMode}
                    progressPercent={batchProgress}
                />
                <PostEditMenu
    isTranslating={isRunning && currentOperation === 'post_edit'}
    // 修复：只允许 QA_REVIEW 状态的分段进入译后编辑
    canEnter={(explorerTabs?.documentTabs ?? []).flatMap(t => t.items ?? []).some((it: any) => 
        it.status === 'QA_REVIEW'
    )}
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
            let  currentItemStatus = activeDocumentItem?.status;
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
                toast.error(`当前分段状态为 ${currentItemStatus || '未知'}，无法进入译后编辑。需要质检复核通过状态`);
                return;
            }
            
            setCurrentOperation('post_edit');
            setIsRunning(true);
            
            try { 
                // 只更新当前选中分段的状态
                await updateDocItemStatusAction(id, 'POST_EDIT');
                // 记录译后编辑事件
                await recordGoToNextTranslationProcessEventAction(id, 'POST_EDIT', 'AGENT', 'SUCCESS');
                
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
    onBatchPostEdit={async () => {
        try {
            const tabs = explorerTabs?.documentTabs ?? [];
            
            // 只获取需要进入译后编辑的分段：QA_REVIEW 状态
            const needPostEditItems: DocumentItemTab[] = tabs.flatMap(t => 
                (t.items ?? []).filter((item: any) => 
                    item.status === 'QA_REVIEW'
                )
            );
            
            const total = needPostEditItems.length;
            if (!total) {
                toast.error("没有需要进入译后编辑的分段：所有分段都已进入译后编辑或未处于质检复核阶段");
                return;
            }

            setIsRunning(true);
            setCurrentOperation('post_edit');
            setProgressTitle('批量译后编辑中');
            setBatchProgress(0);
            setBatchOpen(true);
            logInfo(`批量译后编辑开始：共 ${total} 个需要进入译后编辑的分段`);

            let done = 0;
            for (const it of needPostEditItems) {
                try { 
                    await updateDocItemStatusAction(it.id, 'POST_EDIT');
                    // 记录译后编辑事件
                    await recordGoToNextTranslationProcessEventAction(it.id, 'POST_EDIT', 'AGENT', 'SUCCESS');
                } catch (e) {
                    console.error(`更新分段 ${it.id} 状态失败:`, e);
                }
                done += 1;
                setBatchProgress(Math.round((done / total) * 100));
            }

            // 如果当前激活项也在处理列表中，更新其状态
            try {
                const currentId = (activeDocumentItem as any)?.id;
                if (currentId) {
                    const currentItem = needPostEditItems.find((it: any) => it.id === currentId);
                    if (currentItem) {
                        setCurrentStage('POST_EDIT' as any);
                    }
                }
            } catch { }

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
    }} 
/>

{/* 签发菜单（与其他按钮同一行显示） */}
<SignoffMenu
    isRunning={isRunning}
    canSignoff={(explorerTabs?.documentTabs ?? []).flatMap(t => t.items ?? []).some((it: any) => it.status === 'POST_EDIT_REVIEW')}
    onSignoffCurrent={async () => {
        try {
            const id = (activeDocumentItem as any)?.id;
            if (!id) return;
            setIsRunning(true);
            setCurrentOperation('post_edit');
            try {
                await updateDocItemStatusAction(id, 'SIGN_OFF');
                // 只记录 SIGN_OFF 事件，COMPLETED 事件应该在后续流程中记录
                await recordGoToNextTranslationProcessEventAction(id, 'SIGN_OFF', 'HUMAN', 'SUCCESS');
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
    onBatchSignoff={async () => {
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
            
            // 只处理 POST_EDIT 状态的分段
            const itemsToSignoff = items.filter((it: any) => it.status === 'POST_EDIT_REVIEW');
            const totalToSignoff = itemsToSignoff.length;
            
            if (totalToSignoff === 0) {
                toast.info('当前页签中没有需要签发的分段');
                setBatchOpen(false);
                setIsRunning(false);
                setCurrentOperation('idle');
                return;
            }
            
            for (const it of itemsToSignoff) {
                try {
                    await updateDocItemStatusAction(it.id, 'SIGN_OFF');
                    // 只记录 SIGN_OFF 事件
                    await recordGoToNextTranslationProcessEventAction(it.id, 'SIGN_OFF', 'HUMAN', 'SUCCESS');
                } catch (e) {
                    console.error(`签发分段 ${it.id} 失败:`, e);
                }
                done += 1;
                setBatchProgress(Math.round((done / totalToSignoff) * 100));
            }
            
            // 更新当前激活项（如果也在处理列表中）
            try {
                if ((activeDocumentItem as any)?.id) {
                    const currentItem = itemsToSignoff.find((it: any) => it.id === (activeDocumentItem as any)?.id);
                    if (currentItem) {
                        setCurrentStage('SIGN_OFF' as any);
                    }
                }
            } catch { }
            
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
                                    const shouldUpdate = itemsToSignoff.some((x: any) => x.id === it.id);
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
    }}
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