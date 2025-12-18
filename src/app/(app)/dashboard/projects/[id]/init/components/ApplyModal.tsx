'use client';

import { Button } from '@/components/ui/button';
import { Coffee } from 'lucide-react';

export default function ApplyModal({
    open,
    applying,
    onCancel,
}: {
    open: boolean;
    applying: boolean;
    onCancel: () => void;
}) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-[360px] rounded-lg bg-white p-6 text-center shadow-lg dark:bg-gray-900">
                <div className="flex flex-col items-center gap-3">
                    <Coffee className="h-8 w-8 text-amber-600" />
                    <div className="text-sm font-medium">
                        {applying ? '正在应用到全文…' : '准备应用到全文…'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                        为确保一致性，应用期间将暂时禁止其他操作。
                    </div>
                    <div className="mt-2 flex gap-2">
                        {!applying ? (
                            <Button variant="outline" onClick={onCancel}>
                                中止
                            </Button>
                        ) : (
                            <Button variant="outline" disabled>
                                处理中…
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
