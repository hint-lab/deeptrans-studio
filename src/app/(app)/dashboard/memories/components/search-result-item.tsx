'use client';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
    formatMemorySearchDisplaySignal,
    memorySearchDisplaySignal,
    splitMemorySearchHighlights,
} from '@/lib/memory-search';
import { Search, Zap, Hash, TrendingUp } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

interface SearchResultItemProps {
    item: {
        id: string;
        sourceText: string;
        targetText: string;
        notes?: string | null;
        score?: number;
        searchMode?: string;
        vectorScore?: number;
        keywordScore?: number;
    };
    index: number;
    searchQuery: string;
    showScores?: boolean;
}

export function SearchResultItem({
    item,
    index,
    searchQuery,
    showScores = true,
}: SearchResultItemProps) {
    const t = useTranslations('Dashboard.Memories.SearchResult');
    const locale = useLocale();
    const renderHighlightedText = (text: string, query: string) =>
        splitMemorySearchHighlights(text, query).map((segment, segmentIndex) =>
            segment.highlighted ? (
                <mark
                    key={`${segmentIndex}-${segment.text}`}
                    className="rounded bg-yellow-200 px-1 dark:bg-yellow-800"
                >
                    {segment.text}
                </mark>
            ) : (
                <span key={`${segmentIndex}-${segment.text}`}>{segment.text}</span>
            )
        );

    const getScoreColor = (score: number) => {
        if (score >= 0.8) return 'text-green-600 dark:text-green-400';
        if (score >= 0.6) return 'text-blue-600 dark:text-blue-400';
        if (score >= 0.4) return 'text-yellow-600 dark:text-yellow-400';
        return 'text-gray-600 dark:text-gray-400';
    };

    const getSearchModeInfo = (mode?: string) => {
        switch (mode) {
            case 'vector':
                return {
                    icon: <Search className="h-3 w-3" />,
                    label: t('vector'),
                    color: 'bg-blue-500',
                };
            case 'keyword':
                return {
                    icon: <Hash className="h-3 w-3" />,
                    label: t('keyword'),
                    color: 'bg-green-500',
                };
            case 'hybrid':
                return {
                    icon: <Zap className="h-3 w-3" />,
                    label: t('hybrid'),
                    color: 'bg-purple-500',
                };
            default:
                return {
                    icon: <TrendingUp className="h-3 w-3" />,
                    label: t('search'),
                    color: 'bg-gray-500',
                };
        }
    };

    const modeInfo = getSearchModeInfo(item.searchMode);
    const retrievalSignal = memorySearchDisplaySignal(item);
    const semanticScore = retrievalSignal.kind === 'semantic' ? retrievalSignal.score : undefined;
    const retrievalLabel = formatMemorySearchDisplaySignal(
        item,
        locale.startsWith('zh') ? 'zh' : 'en'
    );
    const semanticPercentage = semanticScore === undefined ? 0 : Math.round(semanticScore * 100);

    return (
        <Card className="p-4 transition-shadow duration-200 hover:shadow-md">
            <div className="space-y-3">
                {/* 头部信息：排名、分数、模式 */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                            #{index + 1}
                        </Badge>
                        <Badge className={`${modeInfo.color} text-xs text-white`}>
                            {modeInfo.icon}
                            <span className="ml-1">{modeInfo.label}</span>
                        </Badge>
                    </div>

                    {showScores && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    {semanticScore === undefined ? (
                                        <span className="cursor-help text-xs text-muted-foreground">
                                            {retrievalLabel}
                                        </span>
                                    ) : (
                                        <div
                                            aria-label={retrievalLabel}
                                            className="flex cursor-help items-center gap-2"
                                        >
                                            <span
                                                className={`text-sm font-medium ${getScoreColor(semanticScore)}`}
                                            >
                                                {semanticPercentage}%
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {t('vector')}
                                            </span>
                                        </div>
                                    )}
                                </TooltipTrigger>
                                <TooltipContent side="left" className="max-w-xs">
                                    <span>{retrievalLabel}</span>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                </div>

                {/* 只有原始向量分数才是可校准的语义相似度。 */}
                {showScores && semanticScore !== undefined && (
                    <div className="space-y-1">
                        <Progress value={semanticPercentage} className="h-1.5" />
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Search className="h-3 w-3" />
                            <span>{retrievalLabel}</span>
                        </div>
                    </div>
                )}

                <Separator />

                {/* 文本内容 */}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-1">
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {t('sourceText')}
                        </div>
                        <div className="break-words text-sm leading-relaxed">
                            {renderHighlightedText(item.sourceText, searchQuery)}
                        </div>
                    </div>

                    <div className="space-y-1">
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {t('targetText')}
                        </div>
                        <div className="break-words text-sm leading-relaxed">
                            {renderHighlightedText(item.targetText, searchQuery)}
                        </div>
                    </div>
                </div>

                {/* 备注 */}
                {item.notes && (
                    <div className="space-y-1 border-t pt-2">
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {t('notes')}
                        </div>
                        <div className="break-words text-xs leading-relaxed text-muted-foreground">
                            {renderHighlightedText(item.notes, searchQuery)}
                        </div>
                    </div>
                )}
            </div>
        </Card>
    );
}
