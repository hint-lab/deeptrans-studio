'use client';

import React, { useEffect } from 'react';
import type { TranslationStage } from '@/store/features/translationSlice';
import { TRANSLATION_STAGES_SEQUENCE, getTranslationStageLabel } from '@/constants/translationStages';
import { ChevronRight } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Check, Undo2, RotateCcw, SkipForward } from 'lucide-react';
import { useActiveDocumentItem } from '@/hooks/useActiveDocumentItem';
import { useRunningState } from '@/hooks/useRunning';
import { useTranslationState } from '@/hooks/useTranslation';
import { updateDocumentStatusByIdAction } from '@/actions/document';
import { updateDocItemStatusAction } from '@/actions/document-item';
import { useExplorerTabs } from '@/hooks/useExplorerTabs';
import { useTranslations } from 'next-intl';

export type StageBadgeBarProps = {
  runTranslate: () => Promise<void>;
  undoTranslate: () => Promise<void>;
  runQA: () => Promise<void>;
  undoQA: () => Promise<void>;
  runPostEdit: () => Promise<void>;
  undoPostEdit: () => Promise<void>;
  saveRecord: (stage: TranslationStage, actorType: string, status: string) => Promise<void>;
  deleteRecord: (stage: TranslationStage) => Promise<void>;
  className?: string;
  label?: string;
};




const StageBadgeBar: React.FC<StageBadgeBarProps> = ({ className, runTranslate, undoTranslate, runQA, undoQA, runPostEdit, undoPostEdit, saveRecord, label }) => {
  const t = useTranslations('IDE.parallelEditor');
  const tIDE = useTranslations('IDE');
  const tStage = useTranslations('IDE.translationStages');
  const { isRunning, setIsRunning } = useRunningState();
  const { currentStage, setCurrentStage } = useTranslationState();
  const { activeDocumentItem, setActiveDocumentItem } = useActiveDocumentItem();
  const { updateDocumentItemStatus } = useExplorerTabs();
  const steps: TranslationStage[] = TRANSLATION_STAGES_SEQUENCE;
  const acceptText = t('actions.approve');
  const rejectText = t('actions.reject');
  const currentStageLabel = label || t('currentStage');
  const redoText = t('redo');
  const signOffText = t('signOff');

  // 辅助函数：同步状态更新
  const syncStatusUpdate = async (itemId: string, status: string) => {
    try {
      // 1. 更新数据库
      await updateDocItemStatusAction(itemId, status as TranslationStage);
      // 2. 同步 Explorer 状态
      updateDocumentItemStatus(itemId, status);
      // 3. 同步当前激活文档项状态
      if (activeDocumentItem.id === itemId) {
        setActiveDocumentItem({ ...activeDocumentItem, status });
      }
    } catch (error) {
      console.error('Status sync failed:', error);
      throw error;
    }
  };

  function onRedo(stage: TranslationStage) {
    setIsRunning(true);
    setTimeout(() => {
      setIsRunning(false);
    }, 5000);
  };

  async function onReject(stage: TranslationStage) {
    setIsRunning(true);
    const backMap: Record<string, TranslationStage> = {
      'MT_REVIEW': 'NOT_STARTED',
      'QA_REVIEW': 'MT_REVIEW',
      'POST_EDIT_REVIEW': 'QA_REVIEW',
      'SIGN_OFF': 'POST_EDIT_REVIEW',
      'COMPLETED': 'SIGN_OFF',
    };
    const prevStage = backMap[stage];

    try {
      if (stage === 'MT_REVIEW') {
        void undoTranslate();
        await syncStatusUpdate(activeDocumentItem.id, 'NOT_STARTED');
      }
      else if (stage === 'QA_REVIEW') {
        void undoQA();
        await syncStatusUpdate(activeDocumentItem.id, 'MT_REVIEW');
      }
      else if (stage === 'POST_EDIT_REVIEW') {
        void undoPostEdit();
        await syncStatusUpdate(activeDocumentItem.id, 'QA_REVIEW');
      }
      else {
        await syncStatusUpdate(activeDocumentItem.id, 'SIGN_OFF');
      }

      setTimeout(() => {
        if (prevStage) setCurrentStage(prevStage);
        setIsRunning(false);
      }, 360);
    } catch (error) {
      console.error('Rollback operation failed:', error);
      setIsRunning(false);
    }
  };

  const onAccept = async (stage: TranslationStage) => {

    setIsRunning(true);
    if (stage === 'NOT_STARTED') {
      setCurrentStage('MT');
      await runTranslate();
      // MT 步骤的记录已在 runTranslate 内部处理
      await syncStatusUpdate(activeDocumentItem.id, 'MT_REVIEW');
      setCurrentStage('MT_REVIEW');
      await saveRecord('MT_REVIEW', 'HUMAN', 'SUCCESS');
      setIsRunning(false);
      return;
    }
    else if (stage === 'MT_REVIEW') {
      setCurrentStage('QA');
      await runQA(); // 触发QA处理流程
      // QA 步骤的记录已在 runQA 内部处理
      await syncStatusUpdate(activeDocumentItem.id, 'QA_REVIEW');
      setCurrentStage('QA_REVIEW');
      await saveRecord('QA_REVIEW', 'HUMAN', 'SUCCESS');
      setIsRunning(false);
      return;
    }
    else if (stage === 'QA_REVIEW') {
      setCurrentStage('POST_EDIT');
      await runPostEdit(); // 自动运行译后编辑
      // POST_EDIT 步骤的记录已在 runPostEdit 内部处理
      await syncStatusUpdate(activeDocumentItem.id, 'POST_EDIT_REVIEW');
      setCurrentStage('POST_EDIT_REVIEW');
      await saveRecord('POST_EDIT_REVIEW', 'HUMAN', 'SUCCESS');
      setIsRunning(false);
      return;
    }
    else if (stage === 'POST_EDIT_REVIEW') {
      // 推进到SIGN_OFF
      setCurrentStage('SIGN_OFF');
      await saveRecord('SIGN_OFF', 'HUMAN', 'SUCCESS');
      await syncStatusUpdate(activeDocumentItem.id, 'SIGN_OFF');

      // 最后推进到COMPLETED
      setCurrentStage('COMPLETED');
      await saveRecord('COMPLETED', 'HUMAN', 'SUCCESS');
      await syncStatusUpdate(activeDocumentItem.id, 'COMPLETED');
      setIsRunning(false);
      return;
    }
    else if (stage === 'SIGN_OFF') {
      setCurrentStage('COMPLETED');
      await saveRecord('COMPLETED', 'HUMAN', 'SUCCESS');
      await syncStatusUpdate(activeDocumentItem.id, 'COMPLETED');
      setIsRunning(false);
      return;
    }
    // 其他情况默认处理
    const nextIdx = Math.min(steps.length - 1, steps.indexOf(stage) + 1);
    setCurrentStage(steps[nextIdx] as TranslationStage);
    await saveRecord(steps[nextIdx] as TranslationStage, 'HUMAN', 'SUCCESS');
    setIsRunning(false);
  };

  const onDone = async (stage: TranslationStage) => {
    setCurrentStage('COMPLETED');
    await saveRecord('COMPLETED', 'HUMAN', 'SUCCESS');
    await syncStatusUpdate(activeDocumentItem.id, 'COMPLETED');
    setIsRunning(false);
  };

  useEffect(() => {
    console.log(currentStage)
    // 只在activeDocumentItem.id变化时才设置状态，避免覆盖正在进行的状态变化
    if (activeDocumentItem.id && !isRunning) {
      setCurrentStage(activeDocumentItem.status as TranslationStage);
    }
  }, [activeDocumentItem.id]);

  return (
    <div className={`bg-background pl-2 pr-1 h-8 text-xs w-full ${className ?? ''}`}>
      <div className="flex justify-between items-center gap-2 w-full">
        <span className="text-muted-foreground whitespace-nowrap flex items-center gap-2">
          {label}
        </span>
        <div className="flex items-center gap-1 px-2 py-1">
          {(() => {
            const idx = Math.max(0, steps.indexOf(currentStage as TranslationStage));
            const base = 'px-2 py-[2px] rounded-full whitespace-nowrap border transition-all duration-200';
            return (
              <>
                {steps.map((step, i) => {
                  const isCur = i === idx;
                  const isDone = i < idx;
                  //const isHuman = step === 'MT_REVIEW' || step === 'QA_REVIEW' || step === 'POST_EDIT_REVIEW' || step === 'SIGN_OFF';
                  //禁用人工作业阶段黄色高亮，全部使用机器翻译风格，避免不必要的视觉冲突与歧义
                  const isHuman = false;
                  const isCompleted = step === 'COMPLETED';
                  let cls = `${base} bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-foreground/70`;
                  if (isDone) cls = `${base} ${isHuman ? 'bg-amber-500 border-amber-600' : 'bg-indigo-500 border-indigo-600'} text-white shadow`;
                  if (isCur) {
                    if (isCompleted) cls = `${base} bg-green-600 border-green-700 text-white shadow ring-2 ring-green-400/40`;
                    else cls = `${base} ${isHuman ? 'bg-amber-500 border-amber-600' : 'bg-indigo-600 border-indigo-700'} text-white shadow ring-2 ${isHuman ? 'ring-amber-400/40' : 'ring-indigo-400/40'}`;
                  }
                  const label = getTranslationStageLabel(step, tStage);
                  return (
                    <div key={step} className="flex items-center">
                      <span className={cls}>
                        {isRunning && isCur && (
                          <Loader2 className="ml-1 inline-block h-3 w-3 animate-spin opacity-90 align-[-2px]" />
                        )}
                        {label}
                      </span>
                      {i < steps.length - 1 && (<ChevronRight className="h-3 w-3 mx-1 text-foreground/40" />)}
                    </div>
                  );
                })}
              </>
            );
          })()}
          {currentStage === 'ERROR' && (
            <span className="px-2 py-[2px] rounded-full whitespace-nowrap border bg-red-600 border-red-700 text-white shadow">
              {tIDE('statusProgress.error')}
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {(currentStage === 'MT_REVIEW' || currentStage === 'QA_REVIEW' || currentStage === 'POST_EDIT') && (
            <Button variant="outline" size="sm" className="h-6 gap-1 rounded-none" onClick={() => onRedo(currentStage)}>
              <RotateCcw className="h-3 w-3" />
              <span className="hidden sm:inline">{redoText}</span>
            </Button>
          )}
          {(currentStage !== 'NOT_STARTED' && currentStage !== 'COMPLETED') && (
            <Button variant="outline" size="sm" className="h-6 gap-1 rounded-none" onClick={() => onReject(currentStage)}>
              <Undo2 className="h-3 w-3" />
              <span className="hidden sm:inline">{rejectText}</span>
            </Button>
          )}
          {currentStage !== 'COMPLETED' && (
            <Button variant="default" size="sm" className="h-6 gap-1 rounded-none" onClick={() => onAccept(currentStage)}>
              <Check className="h-3 w-3" />
              <span className="hidden sm:inline">{acceptText}</span>
            </Button>
          )}
          {currentStage !== 'COMPLETED' && currentStage !== 'NOT_STARTED' && (
            <Button variant="secondary" size="sm" className="h-6 gap-1 rounded-none" onClick={() => onDone(currentStage)}>
              <SkipForward className="h-3 w-3" />
              <span className="hidden sm:inline">{signOffText}</span>
            </Button>
          )}
        </div>
      </div>
      {/* 仅保留 7 阶段工作流徽标作为主显示 */}
    </div>
  );
};

export default StageBadgeBar;


