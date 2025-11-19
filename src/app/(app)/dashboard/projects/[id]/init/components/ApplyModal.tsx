"use client";

import { Button } from '@/components/ui/button'
import { Coffee } from 'lucide-react'

export default function ApplyModal({ open, applying, onCancel }: { open: boolean; applying: boolean; onCancel: () => void }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg p-6 w-[360px] text-center">
        <div className="flex flex-col items-center gap-3">
          <Coffee className="h-8 w-8 text-amber-600" />
          <div className="text-sm font-medium">{applying ? '正在应用到全文…' : '准备应用到全文…'}</div>
          <div className="text-xs text-muted-foreground">为确保一致性，应用期间将暂时禁止其他操作。</div>
          <div className="flex gap-2 mt-2">
            {!applying ? (
              <Button variant="outline" onClick={onCancel}>中止</Button>
            ) : (
              <Button variant="outline" disabled>处理中…</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}


