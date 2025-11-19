"use client";

import { Loader2 } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useState } from 'react'
import { useTranslations } from 'next-intl'

export type PreviewSegmentItem = { type: string; sourceText: string; order?: number; metadata?: any }

export default function SegmentPanel({
  segItems,
  segLoading,
  segError,
  onResegment,
  busy,
}: {
  segItems: PreviewSegmentItem[]
  segLoading: boolean
  segError: string | null
  onResegment: (opts?: { all?: boolean }) => void
  busy?: boolean
}) {
  const t = useTranslations('Dashboard.Init')
  const isBusy = !!busy || !!segLoading
  const [showFull, setShowFull] = useState(false)
  const itemsToShow = showFull ? segItems : segItems.slice(0, 100)
  return (
    <section className="space-y-2" id="step-segment">
      <div className="text-xs font-medium text-muted-foreground">{t('segmentResult')}</div>
      <div className="p-4 border rounded-lg bg-white dark:bg-gray-900 space-y-3">
        <div className="px-1 -mt-1 flex items-center justify-end gap-2">
          {isBusy && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground w-full px-1">
              <Loader2 className="h-3 w-3 animate-spin" /> {t('generatingPreview')}
            </div>
          )}
          <Label htmlFor="toggle-seg-full" className="text-xs text-muted-foreground whitespace-nowrap">{t('showFull')}</Label>
          <Switch id="toggle-seg-full" checked={showFull} onCheckedChange={(v) => { setShowFull(v); onResegment({ all: v }) }} />
        </div>

        {segError && <div className="text-xs text-red-500">{segError}</div>}
        <div className="rounded border divide-y">
          {itemsToShow.map((it, i) => (
            <div key={i} className="p-2 text-sm">
              <span className={`px-1.5 py-[1px] rounded text-[10px] mr-2 border ${(it.type || '').toUpperCase().startsWith('HEADING') || (it.type || '').toUpperCase() === 'TITLE' ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-muted border-border text-foreground/70'}`}>{it.type}</span>
              <span className="whitespace-pre-wrap break-words align-top">{String(it.sourceText || '').replace(/\<\|\/?\d+\|\>/g, '').trim()}</span>
            </div>
          ))}
          {!segItems.length && !segLoading && <div className="p-6 text-sm text-muted-foreground">{t('noPreview')}</div>}
        </div>

        {segItems.length > 0 && (
          <div className="flex items-center justify-between rounded-md px-3 py-2 text-xs bg-blue-50/60 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <span className="text-blue-700 dark:text-blue-300">✅  {t('segmentPreviewDoneTip')}</span>
          </div>
        )}
      </div>
    </section>
  )
}
