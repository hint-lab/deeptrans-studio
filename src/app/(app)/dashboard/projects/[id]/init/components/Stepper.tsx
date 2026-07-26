'use client';

import { CheckCircle2, FileText, Scissors, BookOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';

export type StepperProps = {
    currentStep: 'parse' | 'segment' | 'terms' | 'done';
    segPct: number;
    termPct: number;
    onStepClick?: (step: 'parse' | 'segment' | 'terms' | 'done') => void;
};

const stepOrder: Array<StepperProps['currentStep']> = ['parse', 'segment', 'terms', 'done'];

export function isInitStepVisuallyComplete(
    step: StepperProps['currentStep'],
    currentStep: StepperProps['currentStep'],
    segPct: number,
    termPct: number
) {
    // Reaching 100% can still leave a stage awaiting the user's confirmation.
    // A non-terminal step becomes complete only after the flow advances past it.
    if (step === 'done') {
        return currentStep === 'done' && segPct >= 100 && termPct >= 100;
    }

    const currentStepIndex = stepOrder.indexOf(currentStep);
    const stepIndex = stepOrder.indexOf(step);
    if (stepIndex >= currentStepIndex) return false;

    if (step === 'parse') return true;
    if (step === 'segment') return segPct >= 100;
    return termPct >= 100;
}

const StepDot = ({
    active,
    done,
    label,
    sub,
}: {
    active?: boolean;
    done?: boolean;
    label: string;
    sub?: string;
}) => (
    <div className="flex min-w-[120px] items-center gap-2">
        <div
            className={`flex h-6 w-6 items-center justify-center rounded-md border text-[11px] ${done ? 'border-emerald-600 bg-emerald-600 text-white' : active ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-900'}`}
        >
            {done ? <CheckCircle2 className="h-4 w-4" /> : label[0]}
        </div>
        <div className="leading-tight">
            <div className="text-xs font-medium">{label}</div>
            {sub ? <div className="text-[10px] text-muted-foreground">{sub}</div> : null}
        </div>
    </div>
);

export default function Stepper({ currentStep, segPct, termPct, onStepClick }: StepperProps) {
    const t = useTranslations('Dashboard.Init');
    const isDone = (k: StepperProps['currentStep']) =>
        isInitStepVisuallyComplete(k, currentStep, segPct, termPct);
    const isActive = (k: StepperProps['currentStep']) => currentStep === k && !isDone(k);
    const steps: Array<{
        key: StepperProps['currentStep'];
        label: string;
        icon: any;
        sub?: string;
    }> = [
        {
            key: 'parse',
            label: t('stepParse'),
            icon: FileText,
            sub: currentStep === 'parse' ? t('inProgress') : t('completed'),
        },
        { key: 'segment', label: t('stepSegment'), icon: Scissors, sub: `${segPct}%` },
        { key: 'terms', label: t('stepTerms'), icon: BookOpen, sub: `${termPct}%` },
        {
            key: 'done',
            label: t('stepDone'),
            icon: CheckCircle2,
            sub: isDone('done') ? t('completed') : '',
        },
    ];

    // 计算中心点百分比（基于 4 个等分列）
    const centersPct: number[] = [0, 1, 2, 3].map(i => ((i * 2 + 1) / (4 * 2)) * 100);
    const baseLeft: number = centersPct[0] ?? 0;
    const baseRight: number = centersPct[3] ?? 100;

    // 已完成段落末端（0: parse, 1: segment, 2: terms）
    let lastCompleted = -1;
    if (isDone('parse')) lastCompleted = 0;
    if (isDone('segment')) lastCompleted = 1;
    if (isDone('terms')) lastCompleted = 2;
    const completedRight: number =
        lastCompleted >= 0 ? (centersPct[lastCompleted + 1] ?? baseLeft) : baseLeft;

    // 活动段落进行中的可视化（紫色进度线）
    let activeRight: number = completedRight;
    if (!isDone('terms') && isActive('terms')) {
        const start = centersPct[2] ?? completedRight;
        const end = centersPct[3] ?? baseRight;
        activeRight = start + ((end - start) * Math.max(0, Math.min(100, termPct))) / 100;
    } else if (!isDone('segment') && isActive('segment')) {
        const start = centersPct[0] ?? baseLeft;
        const end = centersPct[1] ?? centersPct[0] ?? baseLeft;
        activeRight = start + ((end - start) * Math.max(0, Math.min(100, segPct))) / 100;
    }

    return (
        <div className="relative mt-4 w-full">
            {/* 基线（连续） */}
            <div className="pointer-events-none absolute left-0 right-0 top-1/2 hidden -translate-y-1/2 px-[12.5%] sm:block">
                <div className="h-[2px] w-full rounded bg-gray-200 dark:bg-gray-800" />
            </div>
            {/* 已完成进度（绿色，连续） */}
            <div
                className="pointer-events-none absolute left-[12.5%] top-1/2 hidden -translate-y-1/2 sm:block"
                style={{ width: `${Math.max(0, completedRight - baseLeft)}%` }}
            >
                <div className="h-[2px] rounded bg-emerald-400 dark:bg-emerald-500" />
            </div>
            {/* 当前步骤进行中（紫色） */}
            <div
                className="pointer-events-none absolute left-[12.5%] top-1/2 hidden -translate-y-1/2 sm:block"
                style={{ width: `${Math.max(0, activeRight - completedRight)}%` }}
            >
                <div className="h-[2px] rounded bg-indigo-500/90" />
            </div>

            {/* 四个步骤卡片（置于连线之上） */}
            <ol className="relative grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-0">
                {steps.map(s => {
                    const done = isDone(s.key);
                    const active = isActive(s.key);
                    const isCurrent = currentStep === s.key;
                    const Icon = s.icon;
                    const curIdx = stepOrder.indexOf(currentStep);
                    const targetIdx = stepOrder.indexOf(s.key);
                    const isReviewable =
                        typeof onStepClick === 'function' &&
                        done &&
                        targetIdx >= 0 &&
                        targetIdx < curIdx;
                    const cardClassName = `relative z-10 inline-flex w-full min-w-0 items-center gap-1.5 rounded-md border px-2 py-2 text-left shadow-sm transition-colors sm:w-32 sm:gap-2 sm:px-3 ${done ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' : active ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-300 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'} ${isReviewable ? 'cursor-pointer hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:hover:bg-gray-800' : 'cursor-default'}`;
                    const content = (
                        <>
                            <div
                                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${done ? 'bg-emerald-600 text-white' : active ? 'bg-white/15 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}
                            >
                                {done ? (
                                    <CheckCircle2 className="h-4 w-4" />
                                ) : (
                                    <Icon className="h-4 w-4" />
                                )}
                            </div>
                            <div className="min-w-0 leading-tight">
                                <div className="break-words text-xs font-medium sm:text-[13px]">
                                    {s.label}
                                </div>
                                {s.sub ? (
                                    <div
                                        className={`text-[11px] ${active ? 'text-white/90' : 'text-muted-foreground'}`}
                                    >
                                        {s.sub}
                                    </div>
                                ) : null}
                            </div>
                        </>
                    );
                    return (
                        <li
                            key={s.key}
                            aria-current={isCurrent ? 'step' : undefined}
                            className="flex min-w-0 items-stretch justify-center sm:items-center sm:py-1"
                        >
                            {isReviewable ? (
                                <button
                                    type="button"
                                    onClick={() => onStepClick?.(s.key)}
                                    className={cardClassName}
                                >
                                    {content}
                                </button>
                            ) : (
                                <div className={cardClassName}>{content}</div>
                            )}
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}
