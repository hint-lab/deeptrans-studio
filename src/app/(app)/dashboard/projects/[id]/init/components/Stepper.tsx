"use client";

import { CheckCircle2, FileText, Scissors, BookOpen } from 'lucide-react'
import { useTranslations } from 'next-intl'

export type StepperProps = {
  currentStep: 'parse' | 'segment' | 'terms' | 'done'
  segPct: number
  termPct: number
  onStepClick?: (step: 'parse' | 'segment' | 'terms' | 'done') => void
}

const StepDot = ({ active, done, label, sub }: { active?: boolean; done?: boolean; label: string; sub?: string }) => (
  <div className="flex items-center gap-2 min-w-[120px]">
    <div className={`h-6 w-6 rounded-md border flex items-center justify-center text-[11px] ${done ? 'bg-emerald-600 border-emerald-600 text-white' : active ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 text-gray-600'}`}>{done ? <CheckCircle2 className="h-4 w-4" /> : label[0]}</div>
    <div className="leading-tight">
      <div className="text-xs font-medium">{label}</div>
      {sub ? <div className="text-[10px] text-muted-foreground">{sub}</div> : null}
    </div>
  </div>
)

export default function Stepper({ currentStep, segPct, termPct, onStepClick }: StepperProps) {
  const t = useTranslations('Dashboard.Init')
  const steps: Array<{ key: StepperProps['currentStep']; label: string; icon: any; sub?: string }> = [
    { key: 'parse', label: t('stepParse'), icon: FileText, sub: currentStep === 'parse' ? t('inProgress') : t('completed') },
    { key: 'segment', label: t('stepSegment'), icon: Scissors, sub: `${segPct}%` },
    { key: 'terms', label: t('stepTerms'), icon: BookOpen, sub: `${termPct}%` },
    { key: 'done', label: t('stepDone'), icon: CheckCircle2, sub: (segPct >= 100 && termPct >= 100) ? t('completed') : '' },
  ]

  const isDone = (k: StepperProps['currentStep']) => {
    if (k === 'parse') return currentStep !== 'parse'
    if (k === 'segment') return segPct >= 100
    if (k === 'terms') return termPct >= 100
    if (k === 'done') return segPct >= 100 && termPct >= 100
    return false
  }
  const isActive = (k: StepperProps['currentStep']) => currentStep === k && !isDone(k)

  // 计算中心点百分比（基于 4 个等分列）
  const centersPct: number[] = [0, 1, 2, 3].map(i => ((i * 2 + 1) / (4 * 2)) * 100)
  const baseLeft: number = centersPct[0] ?? 0
  const baseRight: number = centersPct[3] ?? 100

  // 已完成段落末端（0: parse, 1: segment, 2: terms）
  let lastCompleted = -1
  if (isDone('parse')) lastCompleted = 0
  if (isDone('segment')) lastCompleted = 1
  if (isDone('terms')) lastCompleted = 2
  const completedRight: number = lastCompleted >= 0 ? (centersPct[lastCompleted + 1] ?? baseLeft) : baseLeft

  // 活动段落进行中的可视化（紫色进度线）
  let activeRight: number = completedRight
  if (!isDone('terms') && isActive('terms')) {
    const start = centersPct[2] ?? completedRight
    const end = centersPct[3] ?? baseRight
    activeRight = start + (end - start) * Math.max(0, Math.min(100, termPct)) / 100
  } else if (!isDone('segment') && isActive('segment')) {
    const start = centersPct[0] ?? baseLeft
    const end = centersPct[1] ?? centersPct[0] ?? baseLeft
    activeRight = start + (end - start) * Math.max(0, Math.min(100, segPct)) / 100
  }

  return (
    <div className="w-full mt-4 relative">
      {/* 基线（连续） */}
      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 px-[12.5%]">
        <div className="h-[2px] w-full bg-gray-200 dark:bg-gray-800 rounded" />
      </div>
      {/* 已完成进度（绿色，连续） */}
      <div className="absolute top-1/2 -translate-y-1/2 left-[12.5%]" style={{ width: `${Math.max(0, completedRight - baseLeft)}%` }}>
        <div className="h-[2px] bg-emerald-400 dark:bg-emerald-500 rounded" />
      </div>
      {/* 当前步骤进行中（紫色） */}
      <div className="absolute top-1/2 -translate-y-1/2 left-[12.5%]" style={{ width: `${Math.max(0, activeRight - completedRight)}%` }}>
        <div className="h-[2px] bg-indigo-500/90 rounded" />
      </div>

      {/* 四个步骤卡片（置于连线之上） */}
      <div className="relative grid grid-cols-4 items-center">
        {steps.map((s, idx) => {
          const done = isDone(s.key)
          const active = isActive(s.key)
          const Icon = s.icon
          const order: Array<StepperProps['currentStep']> = ['parse', 'segment', 'terms', 'done']
          const curIdx = order.indexOf(currentStep)
          const targetIdx = order.indexOf(s.key)
          const isClickable = typeof onStepClick === 'function' && targetIdx >= 0 && targetIdx < curIdx
          return (
            <div key={s.key} className="flex items-center justify-center py-1">
              <button
                type="button"
                onClick={isClickable ? () => onStepClick?.(s.key) : undefined}
                className={`relative z-10 px-3 w-32 py-2 rounded-md border inline-flex items-center gap-2 shadow-sm transition-colors ${done ? 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 dark:border-emerald-800' : active ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300'} ${isClickable ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800' : 'cursor-default'}`}
                aria-disabled={!isClickable}
              >
                <div className={`h-6 w-6 rounded-md flex items-center justify-center ${done ? 'bg-emerald-600 text-white' : active ? 'bg-white/15 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
                  {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <div className="leading-tight">
                  <div className="text-[13px] font-medium">{s.label}</div>
                  {s.sub ? <div className={`text-[11px] ${active ? 'text-white/90' : 'text-muted-foreground'}`}>{s.sub}</div> : null}
                </div>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}


