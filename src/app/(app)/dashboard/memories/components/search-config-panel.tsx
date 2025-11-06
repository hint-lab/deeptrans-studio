"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Settings, Search, Zap } from "lucide-react";
import { HybridSearchConfig } from "@/types/hybrid-search";
import { useTranslations } from "next-intl";

interface SearchConfigPanelProps {
    config: Partial<HybridSearchConfig>;
    onConfigChange: (config: Partial<HybridSearchConfig>) => void;
    similarityThreshold: number;
    onSimilarityThresholdChange: (threshold: number) => void;
    maxResults: number;
    onMaxResultsChange: (maxResults: number) => void;
}

export function SearchConfigPanel({
    config,
    onConfigChange,
    similarityThreshold,
    onSimilarityThresholdChange,
    maxResults,
    onMaxResultsChange
}: SearchConfigPanelProps) {
    const [isOpen, setIsOpen] = useState(false);
    const t = useTranslations("Dashboard.Memories.SearchConfig");
    const updateConfig = (updates: Partial<HybridSearchConfig>) => {
        onConfigChange({ ...config, ...updates });
    };

    const getSearchModeInfo = (mode: string) => {
        switch (mode) {
            case 'vector':
                return { label: t('vector'), color: 'bg-blue-500', description: t('semanticSimilarity') };
            case 'keyword':
                return { label: t('keyword'), color: 'bg-green-500', description: t('keywordMatching') };
            case 'hybrid':
                return { label: t('hybrid'), color: 'bg-purple-500', description: t('vectorAndKeyword') };
            default:
                return { label: t('hybrid'), color: 'bg-purple-500', description: t('vectorAndKeyword') };
        }
    };

    const getFusionMethodInfo = (method: string) => {
        switch (method) {
            case 'weighted_sum':
                return { label: t('weightedSum'), description: t('weightedSumDescription') };
            case 'rank_fusion':
                return { label: t('rankFusion'), description: t('rankFusionDescription') };
            case 'reciprocal_rank_fusion':
                return { label: t('reciprocalRankFusion'), description: t('reciprocalRankFusionDescription') };
            default:
                return { label: t('weightedSum'), description: t('weightedSumDescription') };
        }
    };

    const modeInfo = getSearchModeInfo(config.mode || 'hybrid');
    const fusionInfo = getFusionMethodInfo(config.fusionStrategy?.method || 'weighted_sum');

    return (
        <Card className="w-full">
            <Collapsible open={isOpen} onOpenChange={setIsOpen}>
                <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Settings className="h-5 w-5" />
                                <div>
                                    <CardTitle className="text-base">{t('searchConfig')}</CardTitle>
                                    <div className="flex items-center gap-2 mt-1">
                                        <Badge variant="secondary" className={`${modeInfo.color} text-white`}>
                                            {modeInfo.label}
                                        </Badge>
                                        <span className="text-xs text-muted-foreground">
                                            {t('threshold')}: {(similarityThreshold * 100).toFixed(0)}% · {t('maxXItems', { max: maxResults })}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                        </div>
                    </CardHeader>
                </CollapsibleTrigger>

                <CollapsibleContent>
                    <CardContent className="space-y-6">
                        {/* 搜索模式选择 */}
                        <div className="space-y-3">
                            <Label className="text-sm font-medium flex items-center gap-2">
                                <Search className="h-4 w-4" />
                                {t('searchMode')}
                            </Label>
                            <Select
                                value={config.mode || 'hybrid'}
                                onValueChange={(value) => updateConfig({ mode: value as any })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="hybrid">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                                            {t('hybrid')} - {t('vectorAndKeyword')}
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="vector">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                            {t('vector')} - {t('semanticSimilarity')}
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="keyword">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                            {t('keyword')} - {t('keywordMatching')}
                                        </div>
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">{modeInfo.description}</p>
                        </div>

                        {/* 相似度阈值 */}
                        <div className="space-y-3">
                            <Label className="text-sm font-medium">
                                {t('similarityThreshold')}: {(similarityThreshold * 100).toFixed(0)}%
                            </Label>
                            <Slider
                                value={[similarityThreshold]}
                                onValueChange={([value]: number[]) => onSimilarityThresholdChange(value || 0.3)}
                                max={1}
                                min={0.1}
                                step={0.05}
                                className="w-full"
                            />
                            <div className="flex justify-between text-xs text-muted-foreground">
                                <span>{t('relaxed')}</span>
                                <span>{t('strict')}</span>
                            </div>
                        </div>

                        {/* 最大结果数 */}
                        <div className="space-y-3">
                            <Label className="text-sm font-medium">{t('maxResults')}</Label>
                            <div className="flex items-center gap-2">
                                <Slider
                                    value={[maxResults]}
                                    onValueChange={([value]: number[]) => onMaxResultsChange(value || 10)}
                                    max={50}
                                    min={5}
                                    step={5}
                                    className="flex-1"
                                />
                                <Input
                                    type="number"
                                    value={maxResults}
                                    onChange={(e) => onMaxResultsChange(parseInt(e.target.value) || 10)}
                                    className="w-20"
                                    min={5}
                                    max={200}
                                />
                            </div>
                        </div>

                        {/* 混合检索特有配置 */}
                        {config.mode === 'hybrid' && (
                            <>
                                {/* 融合策略 */}
                                <div className="space-y-3">
                                    <Label className="text-sm font-medium flex items-center gap-2">
                                        <Zap className="h-4 w-4" />
                                        {t('fusionStrategy')}
                                    </Label>
                                    <Select
                                        value={config.fusionStrategy?.method || 'weighted_sum'}
                                        onValueChange={(value) => updateConfig({
                                            fusionStrategy: { ...config.fusionStrategy, method: value as any }
                                        })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="weighted_sum">{t('weightedSum')} - {t('weightedSumDescription')}</SelectItem>
                                            <SelectItem value="rank_fusion">{t('rankFusion')} - {t('rankFusionDescription')}</SelectItem>
                                            <SelectItem value="reciprocal_rank_fusion">{t('reciprocalRankFusion')} - {t('reciprocalRankFusionDescription')}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground">{fusionInfo.description}</p>
                                </div>

                                {/* 权重配置 (仅加权求和时显示) */}
                                {config.fusionStrategy?.method === 'weighted_sum' && (
                                    <div className="space-y-4 border rounded-lg p-3 bg-muted/20">
                                        <Label className="text-sm font-medium">{t('weightConfig')}</Label>

                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <Label className="text-xs">{t('vectorSearchWeight')}</Label>
                                                <span className="text-xs font-mono">
                                                    {((config.fusionStrategy?.weights?.vectorWeight || 0.7) * 100).toFixed(0)}%
                                                </span>
                                            </div>
                                            <Slider
                                                value={[config.fusionStrategy?.weights?.vectorWeight || 0.7]}
                                                onValueChange={([value]: number[]) => updateConfig({
                                                    fusionStrategy: {
                                                        method: config.fusionStrategy?.method || 'weighted_sum',
                                                        ...config.fusionStrategy,
                                                        weights: {
                                                            vectorWeight: value || 0.7,
                                                            keywordWeight: 1 - (value || 0.7)
                                                        }
                                                    }
                                                })}
                                                max={1}
                                                min={0}
                                                step={0.1}
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <Label className="text-xs">{t('keywordSearchWeight')}</Label>
                                                <span className="text-xs font-mono">
                                                    {((config.fusionStrategy?.weights?.keywordWeight || 0.3) * 100).toFixed(0)}%
                                                </span>
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {t('autoAdjusted')} {(100 - ((config.fusionStrategy?.weights?.vectorWeight || 0.7) * 100)).toFixed(0)}%
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* RRF 参数配置 */}
                                {config.fusionStrategy?.method === 'reciprocal_rank_fusion' && (
                                    <div className="space-y-3 border rounded-lg p-3 bg-muted/20">
                                        <Label className="text-sm font-medium">{t('rrfParameter')}</Label>
                                        <div className="space-y-2">
                                            <Label className="text-xs">{t('kValueLabel', { k: config.fusionStrategy?.rankFusion?.k || 60 })}</Label>
                                            <Slider
                                                value={[config.fusionStrategy?.rankFusion?.k || 60]}
                                                onValueChange={([value]: number[]) => updateConfig({
                                                    fusionStrategy: {
                                                        method: config.fusionStrategy?.method || 'reciprocal_rank_fusion',
                                                        ...config.fusionStrategy,
                                                        rankFusion: { k: value }
                                                    }
                                                })}
                                                max={100}
                                                min={10}
                                                step={5}
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                {t('kValueHint')}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}

                        {/* 关键词匹配类型 */}
                        {(config.mode === 'keyword' || config.mode === 'hybrid') && (
                            <div className="space-y-3">
                                <Label className="text-sm font-medium">{t('keywordMatchingType')}</Label>
                                <Select
                                    value={config.keywordSearch?.matchType || 'contains'}
                                    onValueChange={(value) => updateConfig({
                                        keywordSearch: {
                                            enabled: config.keywordSearch?.enabled ?? true,
                                            topK: config.keywordSearch?.topK ?? 10,
                                            ...config.keywordSearch,
                                            matchType: value as any
                                        }
                                    })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="contains">{t('containsMatch')} - {t('flexibleMatch')}</SelectItem>
                                        <SelectItem value="exact">{t('exactMatch')} - {t('exactMatchDescription')}</SelectItem>
                                        <SelectItem value="phrase">{t('phraseMatch')} - {t('continuousMatch')}</SelectItem>
                                        <SelectItem value="fuzzy">{t('fuzzyMatch')} - {t('tolerantMatch')}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </CardContent>
                </CollapsibleContent>
            </Collapsible>
        </Card>
    );
}
