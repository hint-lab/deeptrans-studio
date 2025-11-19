"use client";

import { useEffect, useMemo, useState } from "react";
import { useActiveDocumentItem } from "@/hooks/useActiveDocumentItem";
import { useAgentWorkflowSteps } from "@/hooks/useAgentWorkflowSteps";
import { listTranslationProcessEventsForSignoff } from "@/actions/translation-process-event";
import { TRANSLATION_STAGES_SEQUENCE, getTranslationStageLabel } from "@/constants/translationStages";
import type { TranslationStage } from "@/store/features/translationSlice";
import { useTranslations } from 'next-intl';

type EventItem = {
  id: string;
  stepKey: string;
  actorType: "AGENT" | "HUMAN";
  actorId?: string | null;
  model?: string | null;
  status: "STARTED" | "SUCCESS" | "FAILED";
  startedAt?: string | Date | null;
  finishedAt?: string | Date | null;
  createdAt?: string | Date | null;
  metadata?: any;
};

export default function SignoffPanel() {
  const t = useTranslations('IDE');
  const tStage = useTranslations('IDE.translationStages');
  const { activeDocumentItem } = useActiveDocumentItem();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(false);

  // 获取工作流状态
  const preStep = useAgentWorkflowSteps(s => s.preStep);
  const qaStep = useAgentWorkflowSteps(s => s.qaStep);
  const peStep = useAgentWorkflowSteps(s => s.peStep);
  const isPreRunning = useAgentWorkflowSteps(s => s.isPreRunning);
  const isQARunning = useAgentWorkflowSteps(s => s.isQARunning);
  const isPERunning = useAgentWorkflowSteps(s => s.isPERunning);
  const preTranslateEmbedded = useAgentWorkflowSteps(s => s.preTranslateEmbedded);
  const qualityAssureBiTerm = useAgentWorkflowSteps(s => s.qualityAssureBiTerm);
  const qualityAssureSyntax = useAgentWorkflowSteps(s => s.qualityAssureSyntax);
  const posteditResult = useAgentWorkflowSteps(s => s.posteditResult);

  const documentItemId = (activeDocumentItem as any)?.id;

  useEffect(() => {
    const run = async () => {
      if (!documentItemId) return;
      setLoading(true);
      try {
        const list = await listTranslationProcessEventsForSignoff(documentItemId);
        setEvents(Array.isArray(list) ? list as any : []);
      } catch (error) {
        console.error('Failed to load translation process events:', error);
        setEvents([]);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [documentItemId, (activeDocumentItem as any)?.status]);

  const timeline = useMemo(() => {
    type StepStatus = "SUCCESS" | "FAILED" | "STARTED" | "IDLE";
    const stages: TranslationStage[] = TRANSLATION_STAGES_SEQUENCE;
    const results = new Map<TranslationStage, { status: StepStatus; actor: string; time?: string }>();

    // 初始化所有 translationStage 为 IDLE
    for (const st of stages) results.set(st, { status: "IDLE", actor: "—" });

    // 根据数据库事件映射 - 按时间排序处理事件
    const sortedEvents = (events || []).sort((a, b) => {
      const timeA = new Date(a.finishedAt || a.createdAt || a.startedAt || 0).getTime();
      const timeB = new Date(b.finishedAt || b.createdAt || b.startedAt || 0).getTime();
      return timeA - timeB;
    });

    for (const e of sortedEvents) {
      const key = String(e.stepKey) as TranslationStage;
      if (!stages.includes(key)) continue;
      const prev = results.get(key)!;
      const nextStatus: StepStatus = e.status === "FAILED" ? "FAILED" : e.status === "STARTED" ? "STARTED" : e.status === "SUCCESS" ? "SUCCESS" : prev.status;
      const actor = e.actorType === "HUMAN" ? (e.actorId || "Human") : (e.model || "Agent");
      const time = (e.finishedAt || e.createdAt || e.startedAt) ? new Date((e.finishedAt || e.createdAt || e.startedAt) as any).toLocaleString() : undefined;

      // 状态更新逻辑：FAILED > STARTED > SUCCESS > IDLE
      const priority: Record<StepStatus, number> = { FAILED: 3, STARTED: 2, SUCCESS: 1, IDLE: 0 } as any;
      const curPr = priority[prev.status];
      const nxtPr = priority[nextStatus];

      // 只有更高优先级或相同优先级但更新的时间才能覆盖
      if (nxtPr > curPr || (nxtPr === curPr && time && (!prev.time || new Date(time).getTime() > new Date(prev.time).getTime()))) {
        results.set(key, { status: nextStatus, actor, time });
      }
    }

    // 工作流顺序性逻辑：确保工作流按正确顺序进行
    // 1. 只有一个步骤可以处于"进行中"状态（最新的）
    // 2. 如果后续步骤在进行中，前面的步骤应该是成功状态

    // 找到所有进行中的步骤
    const startedSteps: Array<{ stage: TranslationStage, time: number }> = [];
    for (const [stage, result] of results.entries()) {
      if (result.status === "STARTED" && result.time) {
        startedSteps.push({
          stage,
          time: new Date(result.time).getTime()
        });
      }
    }

    // 按时间排序，最新的保持"进行中"，其他改为"成功"
    if (startedSteps.length > 1) {
      startedSteps.sort((a, b) => b.time - a.time); // 最新的在前

      for (let i = 1; i < startedSteps.length; i++) {
        const olderStep = startedSteps[i];
        if (olderStep && olderStep.stage) {
          const result = results.get(olderStep.stage);
          if (result) {
            results.set(olderStep.stage, { ...result, status: "SUCCESS" });
          }
        }
      }
    }

    // 确保工作流顺序性：如果某个步骤在进行中，前面的步骤应该已完成
    for (let i = 0; i < stages.length; i++) {
      const currentStage = stages[i] as TranslationStage;
      const current = results.get(currentStage);

      if (current?.status === "STARTED") {
        // 将前面所有待开始或进行中的步骤标记为成功
        for (let j = 0; j < i; j++) {
          const prevStage = stages[j] as TranslationStage;
          const prev = results.get(prevStage);
          if (prev && (prev.status === "IDLE" || prev.status === "STARTED")) {
            results.set(prevStage, {
              ...prev,
              status: "SUCCESS",
              actor: current.actor,
              time: current.time ? new Date(new Date(current.time).getTime() - (i - j) * 1000).toLocaleString() : undefined
            });
          }
        }
        break; // 只处理第一个进行中的步骤
      }
    }

    // 最终状态逻辑：如果签发成功，完成也应该成功
    const signoffResult = results.get('SIGN_OFF');
    const completedResult = results.get('COMPLETED');
    if (signoffResult?.status === 'SUCCESS' && completedResult?.status === 'IDLE') {
      results.set('COMPLETED', {
        status: 'SUCCESS',
        actor: signoffResult.actor,
        time: signoffResult.time
      });
    }

    // 兜底逻辑：如果没有数据库事件，根据当前状态推断时间线
    if (!events || events.length === 0) {
      const currentStatus = (activeDocumentItem as any)?.status;
      if (currentStatus) {
        // 找到当前状态在序列中的位置
        const currentIndex = stages.indexOf(currentStatus);
        if (currentIndex >= 0) {
          // 将当前状态之前的所有阶段标记为成功
          for (let i = 0; i <= currentIndex; i++) {
            const stage = stages[i];
            if (stage) {
              results.set(stage, {
                status: "SUCCESS",
                actor: "Human",
                time: new Date().toLocaleString()
              });
            }
          }

          // 如果当前是SIGN_OFF，同时标记COMPLETED为成功
          if (currentStatus === 'SIGN_OFF') {
            results.set('COMPLETED', {
              status: "SUCCESS",
              actor: "Human",
              time: new Date().toLocaleString()
            });
          }
        }
      }
    }

    return stages.map((st) => ({ key: st, label: getTranslationStageLabel(st, tStage), ...(results.get(st) as any) }));
  }, [events, preStep, qaStep, peStep, isPreRunning, isQARunning, isPERunning, preTranslateEmbedded, qualityAssureBiTerm, qualityAssureSyntax, posteditResult, tStage, (activeDocumentItem as any)?.status]);

  return (
    <div className="w-full mt-2 border rounded p-2 bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-900">
      <div className="flex items-center justify-between">
        <div className="text-xs text-foreground/70 font-medium">{t('stageTimeline')}</div>
        {loading && <div className="text-[11px] text-foreground/60">{t('loadingDots')}</div>}
      </div>
      <div className="mt-2 rounded bg-white border overflow-x-auto w-full dark:bg-slate-900 dark:border-slate-800">
        <div className="relative flex items-start gap-6 px-4 py-4 w-full">
          {timeline.length ? timeline.map((s, i) => {
            const isDone = s.status === 'SUCCESS';
            const isFail = s.status === 'FAILED';
            const isRun = s.status === 'STARTED';
            const dotCls = isFail
              ? 'bg-red-500 border-red-600'
              : isDone
                ? 'bg-blue-600 border-blue-700'
                : isRun
                  ? 'bg-yellow-400 border-yellow-500'
                  : 'bg-white dark:bg-slate-900 border-blue-300 dark:border-blue-700';
            return (
              <div key={s.key} className="relative flex flex-col items-center">
                {/* 连接线（到下一个节点） */}
                {i < timeline.length - 1 && (
                  <div className={`absolute top-3 left-4 right-[-3rem] h-[2px] ${isFail ? 'bg-red-200 dark:bg-red-900' : isDone ? 'bg-blue-200 dark:bg-blue-900' : 'bg-blue-100 dark:bg-blue-800'}`} />
                )}
                {/* 节点 */}
                <div className={`z-10 h-6 w-6 rounded-full border-2 ${dotCls} shadow`} />
                {/* 标签 */}
                <div className="mt-2 text-[11px] text-foreground/80 whitespace-nowrap">
                  {s.label}
                </div>
                {/* 状态文案 */}
                <div className={`text-[10px] mt-0.5 ${isFail ? 'text-red-600' : isDone ? 'text-blue-600' : 'text-foreground/50'}`}>
                  <div>{isFail ? t('failed') : isDone ? t('success') : isRun ? t('inProgress') : t('notStarted')}</div>
                  <div className="text-foreground/50">{s.actor || '—'}</div>
                  {s.time && (<div className="text-foreground/50">{s.time}</div>)}
                </div>
              </div>
            );
          }) : (
            <div className="text-xs text-foreground/60 px-4 py-6">{t('noEvents')}</div>
          )}
        </div>
      </div>
    </div>
  );
}


