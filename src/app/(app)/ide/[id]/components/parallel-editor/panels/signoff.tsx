'use client';

import { listTranslationProcessEventsForSignoff } from '@/actions/translation-process-event';
import {
    TRANSLATION_STAGES_SEQUENCE,
    getTranslationStageLabel,
} from '@/constants/translationStages';
import { useActiveDocumentItem } from '@/hooks/useActiveDocumentItem';
import type { TranslationStage } from '@/store/features/translationSlice';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';

export type SignoffEventItem = {
    id: string;
    stepKey: string;
    actorType: 'AGENT' | 'USER';
    actorId?: string | null;
    model?: string | null;
    status: 'STARTED' | 'SUCCESS' | 'FAILED';
    startedAt?: string | Date | null;
    finishedAt?: string | Date | null;
    createdAt?: string | Date | null;
    metadata?: any;
};

export type SignoffStepStatus = 'SUCCESS' | 'FAILED' | 'STARTED' | 'IDLE';

export type SignoffTimelineStep = {
    status: SignoffStepStatus;
    actor: string;
    time?: string;
};

export type SignoffEventLoadState = 'idle' | 'loading' | 'ready' | 'error';

type BuildSignoffTimelineOptions = {
    /**
     * The document's current stage is only a safe fallback after a successful
     * audit-event read.  A failed read is not evidence that earlier stages
     * completed successfully.
     */
    inferFromCurrentStatus?: boolean;
};

/**
 * Reconciles persisted process events with the document's current stage.
 *
 * The current stage can fill an absent event in an earlier stage, but it is
 * not evidence that an explicitly recorded result (especially a failure) was
 * successful. Event data therefore wins over inferred status; only true idle
 * gaps are backfilled.
 */
export function buildSignoffTimeline(
    events: readonly SignoffEventItem[],
    currentStatus: TranslationStage,
    stages: readonly TranslationStage[] = TRANSLATION_STAGES_SEQUENCE,
    { inferFromCurrentStatus = true }: BuildSignoffTimelineOptions = {}
) {
    const results = new Map<TranslationStage, SignoffTimelineStep>();
    for (const stage of stages) results.set(stage, { status: 'IDLE', actor: '—' });

    // Work on a copy so deriving the display timeline cannot mutate React state.
    const sortedEvents = [...events].sort((a, b) => {
        const timeA = new Date(a.finishedAt || a.createdAt || a.startedAt || 0).getTime();
        const timeB = new Date(b.finishedAt || b.createdAt || b.startedAt || 0).getTime();
        return timeA - timeB;
    });

    for (const event of sortedEvents) {
        const key = String(event.stepKey) as TranslationStage;
        if (!stages.includes(key)) continue;

        const actor = event.actorType === 'USER' ? 'Human' : 'Agent';
        const rawTime = event.finishedAt || event.createdAt || event.startedAt;
        const time = rawTime ? new Date(rawTime).toLocaleString() : undefined;
        results.set(key, { status: event.status as SignoffStepStatus, actor, time });
    }

    if (!inferFromCurrentStatus) return results;

    const currentIndex = stages.indexOf(currentStatus);
    if (currentIndex === -1) return results;

    stages.forEach((stage, index) => {
        const previous = results.get(stage)!;

        if (index < currentIndex) {
            // A later current status proves only that a missing stage was passed.
            // It must not rewrite an actual FAILED or STARTED process event.
            if (previous.status === 'IDLE') {
                results.set(stage, { ...previous, status: 'SUCCESS', actor: 'System' });
            }
            return;
        }

        if (index === currentIndex) {
            if (previous.status !== 'SUCCESS' && previous.status !== 'FAILED') {
                results.set(stage, {
                    ...previous,
                    status: stage === 'COMPLETED' ? 'SUCCESS' : 'STARTED',
                    actor: previous.actor !== '—' ? previous.actor : 'System',
                });
            }
            return;
        }

        // Future stages are not part of the active run after a workflow rollback.
        results.set(stage, { status: 'IDLE', actor: '—', time: undefined });
    });

    return results;
}

/**
 * Keeps audit-data availability separate from an empty audit trail.  A ready
 * but empty list may be reconciled against the current document stage; an
 * unavailable list must remain unknown instead of being inferred as success.
 */
export function buildSignoffTimelineForLoadState(
    events: readonly SignoffEventItem[],
    currentStatus: TranslationStage,
    loadState: SignoffEventLoadState,
    stages: readonly TranslationStage[] = TRANSLATION_STAGES_SEQUENCE
) {
    return buildSignoffTimeline(events, currentStatus, stages, {
        inferFromCurrentStatus: loadState === 'ready',
    });
}

export default function SignoffPanel() {
    const t = useTranslations('IDE');
    const tStage = useTranslations('IDE.translationStages');
    const { activeDocumentItem } = useActiveDocumentItem();
    const [events, setEvents] = useState<SignoffEventItem[]>([]);
    const [eventLoadState, setEventLoadState] = useState<SignoffEventLoadState>('idle');
    const [reloadVersion, setReloadVersion] = useState(0);
    const loadRequestRef = useRef(0);

    const documentItemId = (activeDocumentItem as any)?.id;
    // 获取当前分段的实时状态，作为时间线渲染的最高准则
    const currentStatus = (activeDocumentItem as any)?.status as TranslationStage;

    useEffect(() => {
        const requestId = ++loadRequestRef.current;

        if (!documentItemId) {
            setEvents([]);
            setEventLoadState('idle');
            return;
        }

        setEvents([]);
        setEventLoadState('loading');

        const run = async () => {
            try {
                const list = await listTranslationProcessEventsForSignoff(documentItemId);
                if (requestId !== loadRequestRef.current) return;
                if (!Array.isArray(list)) {
                    throw new Error('Unexpected translation process event response');
                }
                setEvents(list as SignoffEventItem[]);
                setEventLoadState('ready');
            } catch {
                if (requestId !== loadRequestRef.current) return;
                console.error('Failed to load translation process events');
                setEvents([]);
                setEventLoadState('error');
            }
        };
        void run();

        return () => {
            if (loadRequestRef.current === requestId) loadRequestRef.current += 1;
        };
    }, [documentItemId, currentStatus, reloadVersion]); // 监听 status 变化重新拉取

    const timeline = useMemo(() => {
        const stages: TranslationStage[] = TRANSLATION_STAGES_SEQUENCE;
        const results = buildSignoffTimelineForLoadState(
            events,
            currentStatus,
            eventLoadState,
            stages
        );

        return stages.map(st => ({
            key: st,
            label: getTranslationStageLabel(st, tStage),
            ...(results.get(st) as any),
        }));
    }, [events, tStage, currentStatus, eventLoadState]);

    return (
        <div className="mt-2 w-full rounded border border-blue-200 bg-blue-50 p-2 dark:border-blue-900 dark:bg-blue-950/30">
            <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-foreground/70">{t('stageTimeline')}</div>
                {eventLoadState === 'loading' && (
                    <div className="text-[11px] text-foreground/60">{t('loadingDots')}</div>
                )}
            </div>
            {eventLoadState === 'error' ? (
                <div
                    className="mt-2 flex items-center justify-between gap-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
                    role="alert"
                >
                    <span>{t('auditEventsLoadFailed')}</span>
                    <button
                        type="button"
                        className="shrink-0 rounded border border-current px-2 py-1 text-[11px] font-medium transition-colors hover:bg-red-100 dark:hover:bg-red-950"
                        onClick={() => setReloadVersion(version => version + 1)}
                    >
                        {t('retryAuditEvents')}
                    </button>
                </div>
            ) : eventLoadState === 'loading' ? (
                <div
                    className="mt-2 rounded border bg-white px-4 py-6 text-center text-xs text-foreground/60 dark:border-slate-800 dark:bg-slate-900"
                    role="status"
                    aria-live="polite"
                >
                    {t('loadingDots')}
                </div>
            ) : eventLoadState === 'idle' ? (
                <div className="mt-2 rounded border bg-white px-4 py-6 text-center text-xs text-foreground/60 dark:border-slate-800 dark:bg-slate-900">
                    {t('noEvents')}
                </div>
            ) : (
                <>
                    {events.length === 0 && (
                        <div
                            className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
                            role="status"
                        >
                            {t('noAuditEventsInferred')}
                        </div>
                    )}
                    <div className="mt-2 w-full overflow-x-auto rounded border bg-white dark:border-slate-800 dark:bg-slate-900">
                        <div
                            className="relative grid w-full items-start px-4 py-4"
                            style={{
                                gridTemplateColumns: `repeat(${Math.max(timeline.length, 1)}, minmax(112px, 1fr))`,
                                minWidth: timeline.length
                                    ? `${timeline.length * 112}px`
                                    : undefined,
                            }}
                        >
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
                                        <div
                                            key={s.key}
                                            className="relative flex min-w-0 flex-col items-center text-center"
                                        >
                                            {/* 连接线 */}
                                            {i < timeline.length - 1 && (
                                                <div
                                                    className={`absolute left-1/2 right-[-50%] top-3 h-[2px] ${isFail ? 'bg-red-200 dark:bg-red-900' : isDone ? 'bg-blue-200 dark:bg-blue-900' : 'bg-blue-100 dark:bg-blue-800'}`}
                                                />
                                            )}
                                            {/* 节点 */}
                                            <div
                                                className={`z-10 h-6 w-6 rounded-full border-2 ${dotCls} shadow`}
                                            />
                                            {/* 标签 */}
                                            <div className="mt-2 w-full px-1 text-center text-[11px] text-foreground/80">
                                                {s.label}
                                            </div>
                                            {/* 状态文案 */}
                                            <div
                                                className={`mt-0.5 w-full px-1 text-center text-[10px] ${isFail ? 'text-red-600' : isDone ? 'text-blue-600' : 'text-foreground/50'}`}
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
                                                <div className="text-foreground/50">
                                                    {s.actor || '—'}
                                                </div>
                                                {s.time && (
                                                    <div className="text-foreground/50">
                                                        {s.time}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="px-4 py-6 text-xs text-foreground/60">
                                    {t('noEvents')}
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
