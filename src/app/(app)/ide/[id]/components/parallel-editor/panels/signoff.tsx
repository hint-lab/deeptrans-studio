'use client';

import { listTranslationProcessEventsForSignoff } from '@/actions/translation-process-event';
import {
    TRANSLATION_STAGES_SEQUENCE,
    getTranslationStageLabel,
} from '@/constants/translationStages';
import { useActiveDocumentItem } from '@/hooks/useActiveDocumentItem';
import type { TranslationStage } from '@/store/features/translationSlice';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

type EventItem = {
    id: string;
    stepKey: string;
    actorType: 'AGENT' | 'HUMAN';
    actorId?: string | null;
    model?: string | null;
    status: 'STARTED' | 'SUCCESS' | 'FAILED';
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

    const documentItemId = (activeDocumentItem as any)?.id;
    // 获取当前分段的实时状态，作为时间线渲染的最高准则
    const currentStatus = (activeDocumentItem as any)?.status as TranslationStage;

    useEffect(() => {
        const run = async () => {
            if (!documentItemId) return;
            setLoading(true);
            try {
                const list = await listTranslationProcessEventsForSignoff(documentItemId);
                setEvents(Array.isArray(list) ? (list as any) : []);
            } catch (error) {
                console.error('Failed to load translation process events:', error);
                setEvents([]);
            } finally {
                setLoading(false);
            }
        };
        run();
    }, [documentItemId, currentStatus]); // 监听 status 变化重新拉取

    const timeline = useMemo(() => {
        type StepStatus = 'SUCCESS' | 'FAILED' | 'STARTED' | 'IDLE';
        const stages: TranslationStage[] = TRANSLATION_STAGES_SEQUENCE;

        // 1. 初始化结果集
        const results = new Map<
            TranslationStage,
            { status: StepStatus; actor: string; time?: string }
        >();
        for (const st of stages) results.set(st, { status: 'IDLE', actor: '—' });

        // 2. 填充事件数据 (保留元数据：时间、执行人)
        // 按时间正序排列，确保同一步骤取到的是最后一次执行的状态
        const sortedEvents = (events || []).sort((a, b) => {
            const timeA = new Date(a.finishedAt || a.createdAt || a.startedAt || 0).getTime();
            const timeB = new Date(b.finishedAt || b.createdAt || b.startedAt || 0).getTime();
            return timeA - timeB;
        });

        for (const e of sortedEvents) {
            const key = String(e.stepKey) as TranslationStage;
            if (!stages.includes(key)) continue;

            const actor = e.actorType === 'HUMAN' ? 'Human' : 'Agent'; // 简化显示，或者显示 e.model
            const rawTime = e.finishedAt || e.createdAt || e.startedAt;
            const time = rawTime ? new Date(rawTime).toLocaleString() : undefined;
            const status = e.status as StepStatus;

            // 存入最新的事件信息
            results.set(key, { status, actor, time });
        }

        // 3. 【核心修复】基于当前状态(Current Status) 进行逻辑覆盖
        // 这解决了两个问题：
        // a. "GAP"问题：如果当前是 COMPLETED，中间的 REVIEW 即使没事件也应该是 SUCCESS。
        // b. "回退"问题：如果从 QA 回退到 MT，那么 QA 应该重置为 IDLE，无论之前有没有事件。

        const currentIndex = stages.indexOf(currentStatus);

        if (currentIndex !== -1) {
            stages.forEach((stage, index) => {
                const prevData = results.get(stage)!;

                if (index < currentIndex) {
                    // 情况 A: 当前步骤之前的步骤 -> 强制标记为成功 (补全 GAP)
                    // 除非它显式标记为失败(但在流转逻辑中，通常失败会卡住，不会进入下一步，所以大概率是成功)
                    if (prevData.status !== 'SUCCESS') {
                        results.set(stage, {
                            ...prevData,
                            status: 'SUCCESS',
                            // 如果没有时间，给一个占位符或保持空，避免显示错误的旧时间
                            actor: prevData.actor !== '—' ? prevData.actor : 'System',
                        });
                    }
                } else if (index === currentIndex) {
                    // 情况 B: 当前步骤
                    if (prevData.status !== 'SUCCESS' && prevData.status !== 'FAILED') {
                        // 【修复点】：如果是 COMPLETED 阶段，它代表终点，应该是 SUCCESS 而不是 STARTED
                        // 其他阶段（如 MT, QA）作为当前阶段时，代表正在进行中 (STARTED)
                        const status = stage === 'COMPLETED' ? 'SUCCESS' : 'STARTED';

                        results.set(stage, {
                            ...prevData,
                            status: status,
                            actor: prevData.actor !== '—' ? prevData.actor : 'System',
                        });
                    }
                } else {
                    // 情况 C: 当前步骤之后的步骤 -> 强制重置为未开始 (清除回退后的"未来"脏数据)
                    results.set(stage, {
                        status: 'IDLE',
                        actor: '—',
                        time: undefined
                    });
                }
            });
        }

        // 4. 生成渲染数组
        return stages.map(st => ({
            key: st,
            label: getTranslationStageLabel(st, tStage),
            ...(results.get(st) as any),
        }));
    }, [events, tStage, currentStatus]);

    return (
        <div className="mt-2 w-full rounded border border-blue-200 bg-blue-50 p-2 dark:border-blue-900 dark:bg-blue-950/30">
            <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-foreground/70">{t('stageTimeline')}</div>
                {loading && (
                    <div className="text-[11px] text-foreground/60">{t('loadingDots')}</div>
                )}
            </div>
            <div className="mt-2 w-full overflow-x-auto rounded border bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="relative flex w-full items-start gap-6 px-4 py-4">
                    {timeline.length ? (
                        timeline.map((s, i) => {
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
                                    {/* 连接线 */}
                                    {i < timeline.length - 1 && (
                                        <div
                                            className={`absolute left-4 right-[-3rem] top-3 h-[2px] ${isFail ? 'bg-red-200 dark:bg-red-900' : isDone ? 'bg-blue-200 dark:bg-blue-900' : 'bg-blue-100 dark:bg-blue-800'}`}
                                        />
                                    )}
                                    {/* 节点 */}
                                    <div
                                        className={`z-10 h-6 w-6 rounded-full border-2 ${dotCls} shadow`}
                                    />
                                    {/* 标签 */}
                                    <div className="mt-2 whitespace-nowrap text-[11px] text-foreground/80">
                                        {s.label}
                                    </div>
                                    {/* 状态文案 */}
                                    <div
                                        className={`mt-0.5 text-[10px] ${isFail ? 'text-red-600' : isDone ? 'text-blue-600' : 'text-foreground/50'}`}
                                    >
                                        <div>
                                            {isFail
                                                ? t('failed')
                                                : isDone
                                                    ? t('success')
                                                    : isRun
                                                        ? t('inProgress')
                                                        : t('notStarted')}
                                        </div>
                                        <div className="text-foreground/50">{s.actor || '—'}</div>
                                        {s.time && (
                                            <div className="text-foreground/50">{s.time}</div>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div className="px-4 py-6 text-xs text-foreground/60">{t('noEvents')}</div>
                    )}
                </div>
            </div>
        </div>
    );
}