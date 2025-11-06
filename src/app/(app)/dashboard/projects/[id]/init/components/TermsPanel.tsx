"use client";
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

export type TermsPanelProps = {
  maxTerms: number
  setMaxTerms: (n: number) => void
  chunkSize: number
  setChunkSize: (n: number) => void
  overlap: number
  setOverlap: (n: number) => void
  termPrompt: string
  setTermPrompt: (s: string) => void
  termPreview: Array<{ term: string; score?: number }>
  termPreviewLoading: boolean
  terms: Array<{ term: string; count: number; score?: number }>
  dict?: Array<{ term: string; translation: string; notes?: string; source?: string }>
  autoApplyTerms?: boolean
  setAutoApplyTerms?: (b: boolean) => void
  termPct: number
  starting: boolean
  onPreview: () => void
  onStart: () => void
  onViewDictionary?: () => void
  onApply?: () => Promise<void>
  applying?: boolean
  onSkip?: () => void
}

export default function TermsPanel(props: TermsPanelProps) {
  const { maxTerms, setMaxTerms, chunkSize, setChunkSize, overlap, setOverlap, termPrompt, setTermPrompt, termPreview, termPreviewLoading, terms, dict, autoApplyTerms, setAutoApplyTerms, termPct, starting, onPreview, onStart, onViewDictionary, onApply, applying } = props
  const t = useTranslations('Dashboard.Init')

  return (
    <section className="space-y-3" id="step-terms">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm">{t('termsTitle')}</CardTitle>
              <CardDescription>{t('termsDesc')}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{t('termsAutoTranslate')}</span>
              <Switch checked={autoApplyTerms} onCheckedChange={(v) => setAutoApplyTerms && setAutoApplyTerms(v)} />
              {props.onSkip && (
                <Button size="sm" variant="secondary" onClick={props.onSkip}>{t('skip')}</Button>
              )}
            </div>


          </div>
        </CardHeader>
        {/* 顶部细分进度：使用 border-b 风格 */}
        <div className="px-6 -mt-1">
          <div className="h-[2px] w-full bg-gray-200 dark:bg-gray-800 rounded relative overflow-hidden">
            <div className="absolute left-0 top-0 h-full bg-emerald-400 dark:bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, termPct))}%` }} />
          </div>
        </div>
        <CardContent className="space-y-4 pt-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">{t('vocabSize')}</Label>
              <Input type="number" min={50} max={1000} step={50} value={maxTerms} onChange={(e) => props.setMaxTerms(Math.max(20, Math.min(1000, Number(e.target.value) || 120)))} />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">{t('chunkSize')}</Label>
              <Input type="number" min={1000} max={12000} step={500} value={chunkSize} onChange={(e) => setChunkSize(Math.max(1000, Math.min(12000, Number(e.target.value) || 5000)))} />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">{t('overlap')}</Label>
              <Input type="number" min={0} max={1000} step={50} value={overlap} onChange={(e) => setOverlap(Math.max(0, Math.min(1000, Number(e.target.value) || 300)))} />
            </div>
            <div className="flex flex-col gap-1 col-span-2">
              <Label className="text-xs text-muted-foreground">{t('termPreference')}</Label>
              <Textarea value={termPrompt} onChange={(e) => setTermPrompt(e.target.value)} placeholder={t('termPreferencePlaceholder')} />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-2">
              <Button variant="outline" onClick={onPreview} disabled={termPreviewLoading || starting}>{termPreviewLoading ? t('extractingShort') : t('extractPreview')}</Button>
            </div>
            {termPreviewLoading && (
              <div className="flex items-center gap-2 mb-2">
                <Loader2 className="h-3 w-3 animate-spin text-xs text-muted-foreground" /> {t('extractingTerms')}
              </div>
            )}
            {!termPreviewLoading && (starting || (termPct > 0 && termPct < 100)) && (
              <div className="flex items-center gap-2 mb-2">
                <Loader2 className="h-3 w-3 animate-spin" /> <span className="text-xs text-muted-foreground whitespace-nowrap">{t('extractingTerms')}</span>
              </div>
            )}
            <div className="text-[11px] text-muted-foreground min-w-[80px] text-right">{termPct}%</div>
          </div>

          {termPct >= 100 && (
            <div className="flex items-center justify-between rounded-md px-3 py-2 text-xs bg-emerald-50/60 dark:bg-emerald-900/20 border">
              <span>{t('termsDone')}</span>
              <div className="flex items-center gap-2">
                {onApply && (
                  <Button size="sm" variant="outline" onClick={onApply} disabled={!!applying}>
                    {applying ? t('writingShort') : t('manualWriteToDict')}
                  </Button>
                )}
                {onViewDictionary && (
                  <Button size="sm" variant="outline" onClick={onViewDictionary}>{t('viewDictionary')}</Button>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            {terms && terms.length ? (
              <ul className="text-sm grid grid-cols-2 gap-x-4 gap-y-1">
                {(() => {
                  const matchedSet = new Set<string>((props.dict || []).map((d) => String(d.term || '')))
                  return terms.map((t, i) => {
                    const enabled = true // 术语禁用在上游 Panel 控制；这里仅展示提取结果的配色
                    const isMatched = matchedSet.has(String(t.term || ''))
                    const cls = enabled
                      ? (isMatched ? 'bg-blue-50 text-blue-800 border border-blue-200' : 'bg-yellow-50 text-yellow-800 border border-yellow-200')
                      : 'border border-dashed bg-white text-foreground/60'
                    return (
                      <li key={`${t.term}-${i}`} className={`flex items-center justify-between border-b py-1 px-2 rounded ${cls}`}>
                        <span className="truncate">{t.term}</span>
                        <span className="text-xs text-muted-foreground">x{t.count}{typeof t.score === 'number' ? ` · ${Math.round(t.score * 100)}` : ''}</span>
                      </li>
                    )
                  })
                })()}
              </ul>
            ) : termPreview && termPreview.length ? (
              <ul className="text-sm grid grid-cols-2 gap-x-4 gap-y-1">
                {(() => {
                  const matchedSet = new Set<string>((props.dict || []).map((d) => String(d.term || '')))
                  return termPreview.map((t, i) => {
                    const enabled = true
                    const isMatched = matchedSet.has(String(t.term || ''))
                    const cls = enabled
                      ? (isMatched ? 'bg-blue-50 text-blue-800 border border-blue-200' : 'bg-yellow-50 text-yellow-800 border border-yellow-200')
                      : 'border border-dashed bg-white text-foreground/60'
                    return (
                      <li key={`${t.term}-${i}`} className={`flex items-center justify-between border-b py-1 rounded ${cls}`}>
                        <span className="truncate">{t.term}</span>
                        <span className="text-xs text-muted-foreground">{typeof t.score === 'number' ? `${Math.round(t.score * 100)}` : ''}</span>
                      </li>
                    )
                  })
                })()}
              </ul>
            ) : (!termPreviewLoading && <div className="text-xs text-muted-foreground">{t('noPreview')}</div>)}
          </div>
        </CardContent>
      </Card>
    </section>
  )
}


