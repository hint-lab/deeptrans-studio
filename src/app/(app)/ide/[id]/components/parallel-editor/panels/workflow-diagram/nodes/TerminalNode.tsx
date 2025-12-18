import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { cn } from '@/lib/utils';
import { Play, CheckCircle2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

type TerminalVariant = 'start' | 'end';

export function TerminalNode({ data }: any) {
    const t = useTranslations('IDE.workflow');
    const variant: TerminalVariant =
        data?.variant === 'end' || data?.label === t('end') ? 'end' : 'start';
    const isStart = variant === 'start';

    return (
        <div
            className={cn(
                'flex w-24 select-none items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-xs shadow-sm',
                isStart
                    ? 'border-rose-600 bg-gradient-to-r from-rose-500 to-fuchsia-500 text-white'
                    : 'border-emerald-600 bg-gradient-to-r from-emerald-500 to-teal-500 text-white'
            )}
        >
            <Handle type="target" position={Position.Left} id="input" className="!opacity-0" />
            {isStart ? (
                <Play className="h-3.5 w-3.5 opacity-90" />
            ) : (
                <CheckCircle2 className="h-3.5 w-3.5 opacity-90" />
            )}
            <span className="truncate font-medium tracking-wide">
                {data?.label || (isStart ? t('start') : t('end'))}
            </span>
            <Handle type="source" position={Position.Right} id="output" className="!opacity-0" />
        </div>
    );
}
