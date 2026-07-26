'use client';

import { Calendar, Database, Languages } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type MemorySummary = {
    id: string;
    name: string;
    description?: string;
    _count?: { entries: number };
    createdAt?: string;
    updatedAt?: string;
    sourceLanguage?: string;
    targetLanguage?: string;
};

type MemoryResourceCardProps = {
    memory: MemorySummary;
    viewMode: 'grid' | 'list';
    formatDate: (date?: string) => string;
    labels: {
        viewMemory: string;
        noDescription: string;
        entriesShort: string;
        updatedShort: string;
    };
    actions: ReactNode;
};

/**
 * A compact, keyboard-accessible resource card shared by the memory catalogue.
 * The full card is one link; the overflow menu sits above it so the two actions
 * never compete for pointer or keyboard focus.
 */
export function MemoryResourceCard({
    memory,
    viewMode,
    formatDate,
    labels,
    actions,
}: MemoryResourceCardProps) {
    const entryCount = memory._count?.entries ?? 0;
    const languagePair = `${memory.sourceLanguage || 'auto'} → ${memory.targetLanguage || 'zh'}`;
    const href = `/dashboard/memories/${memory.id}`;
    const isGrid = viewMode === 'grid';

    return (
        <article
            className={cn(
                'group relative rounded-md border border-l-[3px] border-l-primary/70 bg-card shadow-sm transition-[border-color,background-color,box-shadow] hover:border-muted-foreground/35 hover:bg-muted/20 hover:shadow-md',
                isGrid ? 'min-h-[108px]' : 'min-h-[76px]'
            )}
        >
            <Link
                href={href}
                aria-label={`${labels.viewMemory}: ${memory.name}`}
                className="absolute inset-0 z-0 rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />

            <div
                className={cn(
                    'pointer-events-none relative z-10 flex min-w-0 gap-3',
                    isGrid ? 'p-3 pr-11' : 'items-center p-3 pr-12'
                )}
            >
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-primary/5 text-primary">
                    <Database className="h-4 w-4" aria-hidden="true" />
                </div>

                <div
                    className={cn(
                        'min-w-0 flex-1 py-0.5',
                        !isGrid && 'sm:pr-24 md:pr-52 lg:pr-[355px]'
                    )}
                >
                    <div className="flex min-w-0 items-center gap-2">
                        <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-4 text-foreground">
                            {memory.name}
                        </h2>
                        {isGrid && (
                            <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                                {entryCount.toLocaleString()} {labels.entriesShort}
                            </span>
                        )}
                    </div>
                    <p className="mt-1 truncate text-[11px] leading-4 text-muted-foreground">
                        {memory.description || labels.noDescription}
                    </p>

                    {isGrid ? (
                        <div className="mt-2 flex min-w-0 items-center gap-3 text-[10px] leading-3 text-muted-foreground">
                            <span className="flex min-w-0 items-center gap-1 truncate">
                                <Languages className="h-3 w-3 shrink-0" aria-hidden="true" />
                                <span className="truncate">{languagePair}</span>
                            </span>
                            <span className="flex shrink-0 items-center gap-1">
                                <Calendar className="h-3 w-3" aria-hidden="true" />
                                {formatDate(memory.updatedAt)}
                            </span>
                        </div>
                    ) : (
                        <div className="mt-1 flex min-w-0 items-center gap-3 text-[11px] leading-4 text-muted-foreground sm:absolute sm:right-12 sm:top-1/2 sm:mt-0 sm:-translate-y-1/2">
                            <span className="font-mono tabular-nums">
                                {entryCount.toLocaleString()} {labels.entriesShort}
                            </span>
                            <span className="hidden items-center gap-1 md:flex">
                                <Languages className="h-3 w-3" aria-hidden="true" />
                                {languagePair}
                            </span>
                            <span className="hidden items-center gap-1 lg:flex">
                                <Calendar className="h-3 w-3" aria-hidden="true" />
                                {labels.updatedShort} {formatDate(memory.updatedAt)}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            <div className="absolute right-2 top-2 z-10 opacity-70 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                {actions}
            </div>
        </article>
    );
}
