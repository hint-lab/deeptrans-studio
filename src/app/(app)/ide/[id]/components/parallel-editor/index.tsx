"use client";
import { useEffect, useState } from "react";
import RichTextEditor from "./rich-text/editor";
import React from "react";
import { X, ChevronLeft, ChevronRight, PanelBottomOpen, PanelBottomClose } from "lucide-react";
import Hello from "./hello-page";
import { cn } from "@/lib/utils";
import { getContentByIdAction, updateDocItemStatusAction } from "src/actions/document-item"; // 假设已创建数据获取方法
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveDocumentItem } from "@/hooks/useActiveDocumentItem";
import { useTranslationContent, useTranslationState, useTranslationLanguage } from "@/hooks/useTranslation";
import MarkdownPreview from '@uiw/react-markdown-preview';
import StageBadgeBar from "./stage-badge";
import { useExplorerTabs } from "@/hooks/useExplorerTabs";
import { useRunningState } from "@/hooks/useRunning";
import {
  extractMonolingualTermsAction,
  lookupDictionaryAction,
  embedAndTranslateAction,
  baselineTranslateAction
} from "@/actions/pre-translate";
import { evaluateSyntaxAction, extractBilingualSyntaxMarkersAction, embedSyntaxAdviceAction } from "@/actions/quality-assure";
import { queryDiscourseAction, evaluateDiscourseAction, embedDiscourseAction, runPostEditAction } from "@/actions/postedit";
import { getLanguageByCode, getLanguageLabelByCode } from "@/utils/translate";
import { useAgentWorkflowSteps } from "@/hooks/useAgentWorkflowSteps";
import { useLogger } from "@/hooks/useLogger";
import { toast } from "sonner";
import { savePreTranslateResultsAction, saveQualityAssureResultsAction, savePostEditResultsAction } from "@/actions/intermediate-results";
import { TranslationProcessPanel } from "./translation-process-panel";
import { useParams } from "next/navigation";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useBottomPanel } from "@/hooks/useBottomPanel";
import { recordGoToNextTranslationProcessEventAction, recordGoToPreviousTranslationStageAction } from "@/actions/translation-process-event";
import { useSession } from "next-auth/react";
import { useTranslations } from 'next-intl';
import { getDocumentItemIntermediateResultsAction } from "@/actions/intermediate-results";
export default function ParallelEditor({
  className
}: {
  className?: string;
}) {
  const t = useTranslations('IDE.parallelEditor');
  const { sourceText, targetText, setSourceTranslationText, setTargetTranslationText } = useTranslationContent();
  const [error, setError] = useState<string | null>(null);
  const { activeDocumentItem, setActiveDocumentItem } = useActiveDocumentItem();
  const { isBottomPanelOpen, toggleBottomPanel } = useBottomPanel();
  const { currentStage, setCurrentStage } = useTranslationState();
  const { sourceLanguage, targetLanguage } = useTranslationLanguage();
  const [stackLayout, setStackLayout] = useState<'vertical' | 'horizontal'>('vertical');
  const { explorerTabs } = useExplorerTabs();
  const { isRunning } = useRunningState();
  const { logSystem, logAgent, logInfo } = useLogger();
  const { setPreOutputs, setQAOutputs, setPosteditOutputs, setPreStep, setQAStep, setPeStep, setPreRunning, setQARunning, setPERunning, preTermEnabled } = useAgentWorkflowSteps();
  const params = useParams();
  const [panelTab, setPanelTab] = useState<string>("pre-flow");
  const projectId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const [sourceLoading, setSourceLoading] = useState<boolean>(false);


  const runTranslate = async () => {
    if (!activeDocumentItem?.id) return;
    try {
      logAgent('MT');
      setPreRunning(true);

      // 记录 MT 阶段开始
      await recordGoToNextTranslationProcessEventAction(activeDocumentItem.id, 'MT', 'AGENT', 'STARTED');

      // 执行真实的workflow步骤
      setPreStep('mono-term-extract');
      logSystem('开始术语抽取');

      // 创建工作流事件: 术语提取开始
      const terms = await extractMonolingualTermsAction(sourceText, { prompt: undefined });

      // 完成工作流事件: 术语提取
      setPreStep('dict-lookup');
      logSystem('开始词典查询');


      // 从 TermCandidate[] 中提取术语字符串
      const termStrings = Array.isArray(terms) ? terms.map((t: any) => t.term).filter(Boolean) : [];
      console.log('提取的术语:', termStrings);
      // 可按需使用已启用术语映射：preTermEnabled
      const termCandidates = termStrings.slice(0, 50).map(t => ({ term: t, score: 1.0 }));
      const dict = await lookupDictionaryAction(
        termCandidates,
        {
          userId: userId
        }
      );

      // 完成工作流事件: 词典查询
      setPreStep('term-embed-trans');
      logSystem('开始术语嵌入翻译');



      const translation = await embedAndTranslateAction(
        sourceText,
        sourceLanguage || 'auto',
        targetLanguage || 'auto',
        dict
      );
      console.log('翻译结果:', translation);
      setTargetTranslationText(translation || '');



      // 更新 useAgentWorkflowSteps 状态
      setPreOutputs({
        terms: terms,
        dict: dict,
        translation: translation,
      });

      // 保存预翻译结果到数据库
      try {
        await savePreTranslateResultsAction(activeDocumentItem.id, {
          terms: terms,
          dict: dict,
          embedded: translation,
          targetText: translation,
        });
        logInfo('预翻译结果已保存到数据库');
      } catch (error) {
        console.error(`保存预翻译结果失败: ${error}`);
      }
      logInfo('单例翻译完成');

      // 记录 MT 阶段成功完成
      await recordGoToNextTranslationProcessEventAction(activeDocumentItem.id, 'MT', 'AGENT', 'SUCCESS');
    } catch (error) {
      console.error(`单例翻译失败: ${error}`);

      // 记录 MT 阶段失败
      await recordGoToNextTranslationProcessEventAction(activeDocumentItem.id, 'MT', 'AGENT', 'FAILED');
    } finally {
      setPreRunning(false);
      setPreStep('idle');
    }
  };


  const undoTranslate = async () => {
    if (!activeDocumentItem?.id) return;
    try {
      logAgent('MT');
      await new Promise(r => setTimeout(r, 300));
      logSystem('撤销单例翻译');
      setTargetTranslationText('');

      // 清空 useAgentWorkflowSteps 状态
      setPreOutputs(undefined);

      // 保存预翻译结果到数据库
      try {
        await savePreTranslateResultsAction(activeDocumentItem.id, {
          terms: [],
          dict: [],
          embedded: '',
          targetText: '',
        });
        logInfo('单例翻译结果已撤销');
      } catch (error) {
        console.error(`撤销单例翻译结果失败: ${error}`);
      }
      logInfo('单例翻译结果已撤销');
    } catch (error) {
      console.error(`撤销单例翻译失败: ${error}`);
    } finally {

    }
  };

  const runQA = async () => {
    if (!activeDocumentItem?.id) return;
    if (!targetText || String(targetText).trim() === '') {
      toast.error(t('qaRequiresTranslation'));
      return;
    }

    try {
      logAgent('QA');
      setQARunning(true);
      console.log('QA开始时的文本:', { sourceLength: sourceText?.length || 0, targetLength: targetText?.length || 0 });

      // 记录 QA 阶段开始
      await recordGoToNextTranslationProcessEventAction(activeDocumentItem.id, 'QA', 'AGENT', 'STARTED');

      // 1) 双语句法连接词/情态词提取
      setQAStep('bi-term-eval');
      logSystem('开始双语句法/情态词提取');
      const biTerm = await extractBilingualSyntaxMarkersAction(sourceText || '', targetText || '');
      setQAOutputs({ biTerm });
      try { await saveQualityAssureResultsAction(activeDocumentItem.id, { biTerm }); } catch { }

      // 2) 句法特征评估
      setQAStep('syntax-eval');
      logSystem('开始句法特征评估');
      const syntax = await evaluateSyntaxAction(sourceText || '', targetText || '', { targetLanguage });
      setQAOutputs({ syntax });
      try { await saveQualityAssureResultsAction(activeDocumentItem.id, { syntax }); } catch { }

      // 3) 句法建议嵌入（可选：此处默认使用全部 issues；若有选择逻辑，请替换为勾选的集合）
      setQAStep('syntex-embed-trans');
      logSystem('开始句法建议嵌入');
      const issues = Array.isArray((syntax as any)?.issues) ? (syntax as any).issues : [];
      try {
        const embedded = await embedSyntaxAdviceAction(sourceText || '', targetText || '', issues);
        try { await saveQualityAssureResultsAction(activeDocumentItem.id, { syntaxEmbedded: embedded }); } catch { }
      } catch { }

      logInfo('单例质检完成');

      // 记录 QA 阶段成功完成
      await recordGoToNextTranslationProcessEventAction(activeDocumentItem.id, 'QA', 'AGENT', 'SUCCESS');
    } catch (e) {
      console.error(`单例质检失败: ${e}`);

      // 记录 QA 阶段失败
      await recordGoToNextTranslationProcessEventAction(activeDocumentItem.id, 'QA', 'AGENT', 'FAILED');
    } finally {
      setQARunning(false);
      setQAStep('idle');
    }
  };

  const undoQA = async () => {
    if (!activeDocumentItem?.id) return;

    try {

      logAgent('QA');
      await new Promise(r => setTimeout(r, 300));
      logSystem('撤销单例质检');
      setTargetTranslationText('');

      // 清空 useAgentWorkflowSteps 状态
      setQAOutputs(undefined);

      // 清空质检结果到数据库
      try {
        await saveQualityAssureResultsAction(activeDocumentItem.id, {
          biTerm: undefined,
          syntax: undefined,
        });
        logInfo('单例质检结果已撤销');
      } catch (error) {
        console.error(`撤销单例质检结果失败: ${error}`);
      }
      logInfo('单例质检结果已撤销');
    } catch (error) {
      console.error(`撤销单例质检失败: ${error}`);
    }
  };

  const runPostEdit = async () => {
    if (!activeDocumentItem?.id) return;
    if (!sourceText || String(sourceText).trim() === '') {
      toast.error(t('postEditRequiresSource'));
      return;
    }
    if (!targetText || String(targetText).trim() === '') {
      toast.error(t('postEditRequiresTranslation'));
      return;
    }

    try {
      logAgent('POST_EDIT');
      setPERunning(true);
      logSystem('开始译后编辑流程');

      // 记录 POST_EDIT 阶段开始
      await recordGoToNextTranslationProcessEventAction(activeDocumentItem.id, 'POST_EDIT', 'AGENT', 'STARTED');

      // 1. 语篇查询
      setPeStep('discourse-query');
      logSystem('开始语篇查询');
      const queryResult = await queryDiscourseAction(sourceText, {
        tenantId: params?.id as string,
      });

      // 2. 语篇评估
      setPeStep('discourse-eval');
      logSystem('开始语篇评估');
      const evaluation = await evaluateDiscourseAction(sourceText, targetText, {
        references: queryResult.hits,
        tenantId: params?.id as string,
      });

      // 3. 语篇嵌入改写
      setPeStep('discourse-embed-trans');
      logSystem('开始语篇嵌入改写');
      const rewrite = await embedDiscourseAction(sourceText, targetText, queryResult.hits, {
        tenantId: params?.id as string,
      });

      // 更新状态
      setPosteditOutputs({
        memos: queryResult.hits,
        discourse: evaluation,
        result: rewrite,
      });

      // 保存译后编辑结果到数据库
      try {
        await savePostEditResultsAction(activeDocumentItem.id, {
          query: queryResult.hits,
          evaluation: evaluation,
          rewrite: rewrite,
        });
        logInfo('译后编辑结果已保存到数据库');
      } catch (error) {
        console.error(`保存译后编辑结果失败: ${error}`);
      }

      // 可选：自动应用改写结果到目标文本
      if (rewrite && rewrite !== targetText) {
        setTargetTranslationText(rewrite);
        logInfo('已自动应用改写结果');
      }

      logInfo('译后编辑流程完成');

      // 记录 POST_EDIT 阶段成功完成
      await recordGoToNextTranslationProcessEventAction(activeDocumentItem.id, 'POST_EDIT', 'AGENT', 'SUCCESS');
    } catch (e) {
      console.error(`译后编辑失败: ${e}`);
      toast.error(t('postEditFailed'));

      // 记录 POST_EDIT 阶段失败
      await recordGoToNextTranslationProcessEventAction(activeDocumentItem.id, 'POST_EDIT', 'AGENT', 'FAILED');
    } finally {
      setPERunning(false);
      setPeStep('idle');
    }
  };

  const undoPostEdit = async () => {
    if (!activeDocumentItem?.id) return;

    try {
      logAgent('POST_EDIT');
      await new Promise(r => setTimeout(r, 300));
      logSystem('撤销译后编辑');

      // 清空状态
      setPosteditOutputs(undefined);

      // 清空译后编辑结果到数据库
      try {
        await savePostEditResultsAction(activeDocumentItem.id, {
          query: undefined,
          evaluation: undefined,
          rewrite: undefined,
        });
        logInfo('译后编辑结果已撤销');
      } catch (error) {
        console.error(`撤销译后编辑结果失败: ${error}`);
      }
    } catch (error) {
      console.error(`撤销译后编辑失败: ${error}`);
    } finally {
      setPeStep('idle');
    }
  };

  const initContentByID = async (id: string) => {
    // 如果id为空，则不进行获取
    if (!id) return;
    try {
      setSourceLoading(true);
      const documentItem = await getContentByIdAction(id);
      console.log("documentItem", documentItem)
      if (documentItem) {
        setSourceTranslationText(documentItem.sourceText);
        setTargetTranslationText(documentItem.targetText || "");
        // 同步阶段状态（确保切换分段后状态正确）
        const currentStage = (documentItem as any)?.status || 'NOT_STARTED';
        setCurrentStage(currentStage as any);

        // 自动触发 baseline 翻译：如果没有译文且状态为 NOT_STARTED
        if (!documentItem.targetText?.trim() && currentStage === 'NOT_STARTED' && documentItem.sourceText?.trim()) {
          try {
            logInfo('自动生成基线翻译...');
            console.log('自动基线翻译参数:', { sourceLanguage, targetLanguage } );
            const baselineText = await baselineTranslateAction(
              documentItem.sourceText,
              sourceLanguage || 'auto',
              targetLanguage || 'auto',
              { prompt: undefined }
            );
            if (baselineText) {
              setTargetTranslationText(baselineText);
              logInfo('基线翻译生成完成');
            }
          } catch (error) {
            console.error('自动基线翻译失败:', error);
            logInfo('自动基线翻译失败，可手动重新生成');
          }
        }

        // 注意：不要在这里更新 activeDocumentItem，会导致无限循环
        const intermediateResults = await getDocumentItemIntermediateResultsAction(id);
        if (intermediateResults) {
          // 只传递 setPreOutputs 需要的字段，避免传入非可序列化数据
          setPreOutputs({
            terms: intermediateResults.preTranslateTerms,
            dict: intermediateResults.preTranslateDict,
            translation: intermediateResults.preTranslateEmbedded
          });

          // 只传递 setQAOutputs 需要的字段
          setQAOutputs({
            biTerm: intermediateResults.qualityAssureBiTerm,
            syntax: intermediateResults.qualityAssureSyntax,
            discourse: intermediateResults.postEditDiscourse
          });
        }

      }
    } catch (err) {
      setError(t('cannotLoadDocument'));
      console.error("获取文档内容失败:", err);
    } finally {
      setSourceLoading(false);
    }
  };

  // 跳转相邻分段（上一条 / 下一条）
  const navigateRelative = async (delta: number) => {
    try {
      const tabs: any[] = (explorerTabs as any)?.documentTabs ?? [];
      const allItems: any[] = tabs.flatMap((t: any) => t.items ?? []);
      if (!allItems.length) return;
      const currentId = (activeDocumentItem as any)?.id;
      const idx = Math.max(0, allItems.findIndex((it) => it.id === currentId));
      const nextIdx = Math.min(Math.max(0, idx + delta), allItems.length - 1);
      const next = allItems[nextIdx];
      if (!next || next.id === currentId) return;
      await initContentByID(next.id);
    } catch { }
  };


  useEffect(() => {
    const handler = () => setStackLayout((prev) => (prev === 'vertical' ? 'horizontal' : 'vertical'));
    window.addEventListener('layout:toggle', handler as any);
    return () => window.removeEventListener('layout:toggle', handler as any);
  }, []);


  useEffect(() => {
    if (activeDocumentItem.id && activeDocumentItem.id !== null) {
      setCurrentStage(activeDocumentItem.status as any)
      // 直接获取内容
      initContentByID(activeDocumentItem.id);
    }
  }, [activeDocumentItem.id]); // 添加contentID依赖

  useEffect(() => {
  }, [sourceText, targetText]);

  // 当currentStage变化时自动打开面板
  useEffect(() => {
    if (currentStage && !isBottomPanelOpen) {
      toggleBottomPanel();
    }
  }, [currentStage, isBottomPanelOpen, toggleBottomPanel]);


  if (error) {
    return <div className="text-red-500">{error}</div>;
  }


  return (
    <div className={cn("flex size-full flex-col", className)}>
      {activeDocumentItem.id === null || activeDocumentItem.id === undefined || activeDocumentItem.id === "" ? (
        <Hello />
      ) : (
        <ResizablePanelGroup direction="vertical" className="size-full">
          <ResizablePanel defaultSize={60} minSize={30}>
            <div className="flex h-full size-full flex-col items-start text-foreground">
              {activeDocumentItem?.id && (
                <StageBadgeBar
                  runTranslate={runTranslate}
                  undoTranslate={undoTranslate}
                  runQA={runQA}
                  undoQA={undoQA}
                  runPostEdit={runPostEdit}
                  undoPostEdit={undoPostEdit}
                  saveRecord={async (stage, actor, status) => {
                    await recordGoToNextTranslationProcessEventAction(activeDocumentItem.id, stage, actor, status);
                  }}
                  deleteRecord={async (stage) => {
                    await recordGoToPreviousTranslationStageAction(activeDocumentItem.id, stage);
                  }}
                />
              )}
              {(() => {
                // 所有阶段均展示双栏（原文+译文）视图
                const singlePreview = false;
                return (
                  <div className="relative flex w-full flex-col flex-1 min-h-0">
                    <div className="flex-1 min-h-0">
                      {singlePreview ? (() => {
                        const previewText = (targetText && String(targetText).trim()) ? targetText : (sourceText || '');
                        const isHtml = /<\w+[^>]*>/.test(previewText || '');
                        return (
                          <div className="w-full h-full overflow-auto border pb-1 rounded">
                            <div className="flex items-center justify-between px-2 py-1 bg-muted/40 border-b text-[11px] text-foreground/70">
                              <span className="font-medium">
                                {t('preview')}: {(targetText && String(targetText).trim()) ? t('targetText') : t('sourceText')}
                              </span>
                              <span className="uppercase tracking-wider">
                                {(targetText && String(targetText).trim()) ? targetLanguage : sourceLanguage}
                              </span>
                            </div>
                            {isHtml ? (
                              <div className="prose p-2" dangerouslySetInnerHTML={{ __html: previewText }} />
                            ) : (
                              <MarkdownPreview
                                source={previewText}
                                className="bg-transparent"
                                style={{ backgroundColor: 'transparent' }}
                              />
                            )}
                          </div>
                        );
                      })() : (() => {
                        const isVertical = stackLayout === 'vertical';
                        return (
                          <div className={`flex w-full ${isVertical ? 'flex-col' : 'flex-row'} items-stretch size-full border overflow-hidden`}>
                            <div className={`${isVertical ? 'w-full' : 'w-1/2'} flex-1 overflow-auto`}>
                              <div className="flex items-center justify-between px-2 py-1 bg-muted/40 border-b text-[11px] text-foreground/70">
                                <span className="font-medium">{t('sourceText')}</span>
                                <span className="uppercase tracking-wider">{sourceLanguage}</span>
                              </div>
                              {(sourceLoading || !sourceText || String(sourceText).trim() === '') ? (
                                <div className="p-4 space-y-3">
                                  <div className="space-y-2">
                                    <Skeleton className="h-4 w-full" />
                                    <Skeleton className="h-4 w-3/4" />
                                  </div>
                                  <div className="text-center pt-2">
                                    <div className="text-sm text-muted-foreground">{t('loadingSource')}</div>
                                  </div>
                                </div>
                              ) : (
                                <RichTextEditor
                                  key={`source-${activeDocumentItem.id}-${sourceText?.length || 0}`}
                                  job="rawtext"
                                  editorId={activeDocumentItem.id}
                                  placeholder={t('editSourceHere')}
                                  initialContent={sourceText}
                                  readOnly={!(currentStage === 'NOT_STARTED')}
                                />
                              )}
                            </div>
                            <Separator orientation={isVertical ? 'horizontal' : 'vertical'} className={`${isVertical ? 'w-full h-1' : 'h-full w-1'} z-100`} />
                            <div className={`${isVertical ? 'w-full' : 'w-1/2'} flex-1 overflow-auto`}>
                              <div className="flex items-center justify-between px-2 py-1 bg-muted/40 border-b text-[11px] text-foreground/70">
                                <span className="font-medium">{t('targetText')}</span>
                                <span className="uppercase tracking-wider">{targetLanguage}</span>
                              </div>
                              <div className="relative">
                                {isRunning && (
                                  <span className="absolute top-0 left-0 right-0 h-0.5 bg-indigo-500 animate-progress" />
                                )}
                                {/* 骨架屏：在准备/预译阶段且译文为空时显示 */}
                                {(!targetText || String(targetText).trim() === '') &&
                                  (currentStage === 'NOT_STARTED') ? (
                                  <div className="p-4 space-y-3">
                                    <div className="space-y-2">
                                      <Skeleton className="h-4 w-full" />
                                      <Skeleton className="h-4 w-3/4" />
                                    </div>
                                    <div className="text-center pt-4">
                                      <div className="text-sm text-muted-foreground">
                                        {t('clickToStartTranslation')}
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="h-full">
                                    <RichTextEditor
                                      key={`target-${activeDocumentItem.id}-${targetText?.length || 0}`}
                                      job="translation"
                                      editorId={activeDocumentItem.id}
                                      placeholder={t('editTargetHere')}
                                      initialContent={targetText}
                                      readOnly={!(currentStage as any === 'POST_EDIT')}
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    {/* 右下角：上一条 / 下一条 / 面板切换 */}
                    <div className="pointer-events-auto absolute right-2 bottom-2 z-20 flex items-center gap-2">
                      <button
                        className="h-8 w-8 rounded-full bg-background/90 border border-border shadow flex items-center justify-center hover:bg-muted"
                        onClick={toggleBottomPanel}
                        title={isBottomPanelOpen ? t('hidePanel') : t('showPanel')}
                      >
                        {isBottomPanelOpen ? <PanelBottomClose className="h-4 w-4" /> : <PanelBottomOpen className="h-4 w-4" />}
                      </button>
                      <button
                        className="h-8 w-8 rounded-full bg-background/90 border border-border shadow flex items-center justify-center hover:bg-muted"
                        onClick={() => navigateRelative(-1)}
                        title={t('previous')}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        className="h-8 w-8 rounded-full bg-background/90 border border-border shadow flex items-center justify-center hover:bg-muted"
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
              <ResizableHandle className="bg-secondary h-1" />
              <ResizablePanel defaultSize={40} minSize={20} maxSize={60}>
                <TranslationProcessPanel
                  panelTab={panelTab}
                  setPanelTab={setPanelTab}
                  projectId={params.id as string}
                />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      )}
    </div>
  );
}
