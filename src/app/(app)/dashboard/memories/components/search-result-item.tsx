"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Search, Zap, Hash, TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";

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
    showScores = true
}: SearchResultItemProps) {
    const t = useTranslations("Dashboard.Memories.SearchResult");
    // 高亮搜索关键词
    const highlightText = (text: string, query: string) => {
        if (!query.trim()) return text;

        const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);
        let highlightedText = text;

        keywords.forEach(keyword => {
            const regex = new RegExp(`(${keyword})`, 'gi');
            highlightedText = highlightedText.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-800 px-1 rounded">$1</mark>');
        });

        return highlightedText;
    };

    const getScoreColor = (score: number) => {
        if (score >= 0.8) return 'text-green-600 dark:text-green-400';
        if (score >= 0.6) return 'text-blue-600 dark:text-blue-400';
        if (score >= 0.4) return 'text-yellow-600 dark:text-yellow-400';
        return 'text-gray-600 dark:text-gray-400';
    };

    const getScoreLabel = (score: number) => {
        if (score >= 0.8) return t('highRelevance');
        if (score >= 0.6) return t('mediumRelevance');
        if (score >= 0.4) return t('lowRelevance');
        return t('weakRelevance');
    };

    const getSearchModeInfo = (mode?: string) => {
        switch (mode) {
            case 'vector':
                return { icon: <Search className="h-3 w-3" />, label: t('vector'), color: 'bg-blue-500' };
            case 'keyword':
                return { icon: <Hash className="h-3 w-3" />, label: t('keyword'), color: 'bg-green-500' };
            case 'hybrid':
                return { icon: <Zap className="h-3 w-3" />, label: t('hybrid'), color: 'bg-purple-500' };
            default:
                return { icon: <TrendingUp className="h-3 w-3" />, label: t('search'), color: 'bg-gray-500' };
        }
    };

    const modeInfo = getSearchModeInfo(item.searchMode);
    const finalScore = item.score || 0;
    const scorePercentage = Math.round(finalScore * 100);

    return (
        <Card className="p-4 hover:shadow-md transition-shadow duration-200">
            <div className="space-y-3">
                {/* 头部信息：排名、分数、模式 */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                            #{index + 1}
                        </Badge>
                        <Badge className={`${modeInfo.color} text-white text-xs`}>
                            {modeInfo.icon}
                            <span className="ml-1">{modeInfo.label}</span>
                        </Badge>
                    </div>

                    {showScores && finalScore > 0 && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="flex items-center gap-2 cursor-help">
                                        <span className={`text-sm font-medium ${getScoreColor(finalScore)}`}>
                                            {scorePercentage}%
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {getScoreLabel(finalScore)}
                                        </span>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="max-w-xs">
                                    <div className="space-y-2">
                                        <div className="font-medium">{t('similarityDetails')}</div>
                                        <div className="space-y-1 text-xs">
                                            <div>{t('overallScore')}: {(finalScore * 100).toFixed(1)}%</div>
                                            {item.vectorScore !== undefined && (
                                                <div>{t('vectorScore')}: {(item.vectorScore * 100).toFixed(1)}%</div>
                                            )}
                                            {item.keywordScore !== undefined && (
                                                <div>{t('keywordScore')}: {(item.keywordScore * 100).toFixed(1)}%</div>
                                            )}
                                        </div>
                                    </div>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                </div>

                {/* 分数进度条 */}
                {showScores && finalScore > 0 && (
                    <div className="space-y-1">
                        <Progress value={scorePercentage} className="h-1.5" />
                        {/* 子分数显示 */}
                        {(item.vectorScore !== undefined || item.keywordScore !== undefined) && (
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                {item.vectorScore !== undefined && (
                                    <div className="flex items-center gap-1">
                                        <Search className="h-3 w-3" />
                                        <span>{t('vector')}: {(item.vectorScore * 100).toFixed(0)}%</span>
                                    </div>
                                )}
                                {item.keywordScore !== undefined && (
                                    <div className="flex items-center gap-1">
                                        <Hash className="h-3 w-3" />
                                        <span>{t('keyword')}: {(item.keywordScore * 100).toFixed(0)}%</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                <Separator />

                {/* 文本内容 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            {t('sourceText')}
                        </div>
                        <div
                            className="text-sm leading-relaxed break-words"
                            dangerouslySetInnerHTML={{
                                __html: highlightText(item.sourceText, searchQuery)
                            }}
                        />
                    </div>

                    <div className="space-y-1">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            {t('targetText')}
                        </div>
                        <div
                            className="text-sm leading-relaxed break-words"
                            dangerouslySetInnerHTML={{
                                __html: highlightText(item.targetText, searchQuery)
                            }}
                        />
                    </div>
                </div>

                {/* 备注 */}
                {item.notes && (
                    <div className="space-y-1 pt-2 border-t">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            {t('notes')}
                        </div>
                        <div
                            className="text-xs text-muted-foreground leading-relaxed break-words"
                            dangerouslySetInnerHTML={{
                                __html: highlightText(item.notes, searchQuery)
                            }}
                        />
                    </div>
                )}
            </div>
        </Card>
    );
}
