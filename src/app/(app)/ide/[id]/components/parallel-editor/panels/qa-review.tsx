'use client';

import {
    getDocumentItemIntermediateResultsAction,
    savePreTranslateResultsAction,
    saveQualityAssureResultsAction,
} from '@/actions/intermediate-results';
import { embedSyntaxAdviceAction } from '@/actions/quality-assure';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useActiveDocumentItem } from '@/hooks/useActiveDocumentItem';
import { useAgentWorkflowSteps } from '@/hooks/useAgentWorkflowSteps';
import { useTranslationContent, useTranslationLanguage } from '@/hooks/useTranslation';
import { createLogger } from '@/lib/logger';
import { wordDiff } from '@/lib/text-diff';
import { cn } from '@/lib/utils';
import { Check, Loader2, ThumbsDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
const logger = createLogger({
    type: 'parallel-editor:qa-review',
}, {
    json: false,// 开启json格式输出
    pretty: false, // 关闭开发环境美化输出
    colors: true, // 仅当json：false时启用颜色输出可用
    includeCaller: false, // 日志不包含调用者
});
export default function QAPanel({ projectId }: { projectId?: string }) {
    const t = useTranslations('IDE.qaPanel');
    const tCommon = useTranslations('Common');
    const { sourceText, targetText, setTargetTranslationText } = useTranslationContent();
    const { sourceLanguage, targetLanguage } = useTranslationLanguage();

    // 基线翻译+ 句法嵌入翻译结果
    const [baseline, setBaseline] = useState<string | null>(null);
    const qaEmbeddedText = useAgentWorkflowSteps(s => s.qualityAssureSyntaxEmbedded) as
        | string
        | undefined;
    const setQaSyntaxEmbedded = useAgentWorkflowSteps(s => s.setQASyntaxEmbedded) as (
        v: string | undefined
    ) => void;

    const [showDiff, setShowDiff] = useState(false);
    const [loadingEmbedded, setLoadingEmbedded] = useState(false);
    const [appliedKind, setAppliedKind] = useState<'baseline' | 'embedded' | null>(null);

    const { activeDocumentItem } = useActiveDocumentItem();

    const [dbResults, setDbResults] = useState<{
        qualityAssureBiTerm?: any;
        qualityAssureSyntax?: any;
        qaDislikedPairs?: Record<string, boolean>;
    } | null>(null);

    const qaBiTerm = useAgentWorkflowSteps(s => s.qualityAssureBiTerm);
    const qaSyntax = useAgentWorkflowSteps(s => s.qualityAssureSyntax);
    const setQAOutputs = useAgentWorkflowSteps(s => s.setQAOutputs);
    const preTranslation = useAgentWorkflowSteps(s => s.preTranslateEmbedded);

    // 调试：监听QA状态变化
    useEffect(() => {
        logger.log('QA面板: 状态变化', {
            qaBiTerm: !!qaBiTerm,
            qaSyntax: !!qaSyntax,
            qaEmbeddedText: !!qaEmbeddedText,
        });
    }, [qaBiTerm, qaSyntax, qaEmbeddedText]);

    // 当文档切换时，从数据库加载已保存的结果
    useEffect(() => {
        const loadResults = async () => {
            const docId = (activeDocumentItem as any)?.id;
            if (!docId) {
                setDbResults(null);
                setQAOutputs(undefined);
                setTargetTranslationText('');
                return;
            }

            try {
                const results = await getDocumentItemIntermediateResultsAction(docId);
                if (results) {
                    setDbResults(results);
                    // 如果数据库有结果，优先使用数据库的结果
                    if (results.qualityAssureBiTerm || results.qualityAssureSyntax) {
                        setQAOutputs({
                            biTerm: results.qualityAssureBiTerm,
                            syntax: results.qualityAssureSyntax,
                        });
                        if ((results as any)?.qaDislikedPairs)
                            setQADislikedPairs((results as any).qaDislikedPairs);
                        if ((results as any).qualityAssureSyntaxEmbedded)
                            setQaSyntaxEmbedded(
                                String((results as any).qualityAssureSyntaxEmbedded || '')
                            );
                    } else {
                        setQAOutputs(undefined);
                    }
                } else {
                    setDbResults(null);
                    setQAOutputs(undefined);
                }
            } catch (error) {
                logger.error('Failed to load QA results:', error);
                setDbResults(null);
                setQAOutputs(undefined);
            }
        };

        loadResults();
    }, [(activeDocumentItem as any)?.id]);

    const panelCls = 'border border-slate-200 dark:border-slate-800';
    const [ignoredTerms, setIgnoredTerms] = useState<Record<string, boolean>>({});
    const [notedTerms, setNotedTerms] = useState<Record<string, boolean>>({});
    const dislikedPairs = useAgentWorkflowSteps(s => s.qaDislikedPairs) as
        | Record<string, boolean>
        | undefined;
    const setQADislikedPairs = useAgentWorkflowSteps(s => s.setQADislikedPairs) as (
        m: Record<string, boolean> | undefined
    ) => void;
    const toggleIgnore = (term: string) =>
        setIgnoredTerms(prev => ({ ...prev, [term]: !prev[term] }));
    const toggleNote = (term: string) => setNotedTerms(prev => ({ ...prev, [term]: !prev[term] }));

    const applyToTarget = async (text: string) => {
        try {
            const content = String(text || '');
            setTargetTranslationText(content);
            const docId = (activeDocumentItem as any)?.id;
            if (docId) {
                try {
                    await savePreTranslateResultsAction(docId, { targetText: content });
                } catch { }
            }
            toast.success(t('applied'));
        } catch {
            toast.error(t('applyFailed'));
        }
    };

    const genSyntaxEmbedded = async () => {
        try {
            if (!sourceText) {
                toast.error(t('noSource'));
                return;
            }
            setLoadingEmbedded(true);
            const syn = asJson(qaSyntax);
            const allIssues: Array<{ type?: string; span?: string; advice?: string }> =
                Array.isArray(syn?.issues) ? syn.issues : [];
            const selectedMap: Record<string, boolean> = (syn?.selectedMap || {}) as Record<
                string,
                boolean
            >;
            const filteredIssues = allIssues.filter((it, idx) => {
                const key = (() => {
                    const t = String(it?.type || '')
                        .trim()
                        .toLowerCase();
                    const s = String(it?.span || '')
                        .trim()
                        .toLowerCase();
                    const a = String(it?.advice || '')
                        .trim()
                        .toLowerCase();
                    return `${t}|${s}|${a}` || `idx:${idx}`;
                })();
                if (Object.keys(selectedMap || {}).length === 0) return true;
                return selectedMap?.[key] === true;
            });
            const text = await embedSyntaxAdviceAction(
                sourceText || '',
                targetText || '',
                filteredIssues
            );
            setQaSyntaxEmbedded(text || '');
            const docId = (activeDocumentItem as any)?.id;
            if (docId) {
                try {
                    await saveQualityAssureResultsAction(docId, { syntaxEmbedded: text });
                } catch { }
            }
        } catch (e: any) {
            toast.error(String(e?.message || t('generateFailed')));
        } finally {
            setLoadingEmbedded(false);
        }
    };

    function extractJsonFromText(txt?: string) {
        const s = String(txt || '').trim();
        if (!s) return undefined;
        // 处理 ```json ... ``` 或 ``` ... ``` 包裹的内容
        const fence = s.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```\s*$/);
        const content: string = fence && typeof fence[1] === 'string' ? fence[1] : s;
        try {
            return JSON.parse(content);
        } catch {
            /* not pure json */
        }
        return undefined;
    }

    function asJson(obj: any) {
        try {
            if (!obj) return undefined;
            if (typeof obj === 'string') return extractJsonFromText(obj as string);
            if (typeof obj === 'object') {
                // 若为 { raw: "```json...```" } 结构，则优先解析 raw
                const raw = (obj as any)?.raw;
                if (typeof raw === 'string') {
                    const parsed = extractJsonFromText(raw as string);
                    if (parsed) return parsed;
                }
                return obj;
            }
            return undefined;
        } catch {
            return undefined;
        }
    }

    function normalizePairs(input: any): Array<{ source: string; target: string; score?: number }> {
        const out: Array<{ source: string; target: string; score?: number }> = [];
        const push = (src: any, tgt: any, sc?: any) => {
            const s = String(src ?? '').trim();
            const t = String(tgt ?? '').trim();
            if (s || t)
                out.push({ source: s, target: t, score: typeof sc === 'number' ? sc : undefined });
        };
        const val = asJson(input) ?? input;
        const candidates: any = Array.isArray(val)
            ? val
            : Array.isArray((val as any)?.pairs)
                ? (val as any).pairs
                : Array.isArray((val as any)?.data)
                    ? (val as any).data
                    : Array.isArray((val as any)?.items)
                        ? (val as any).items
                        : Array.isArray((val as any)?.syntaxPairs)
                            ? (val as any).syntaxPairs
                            : undefined;
        if (Array.isArray(candidates)) {
            for (const it of candidates) {
                if (it && typeof it === 'object') {
                    push(
                        (it as any).source ??
                        (it as any).src ??
                        (it as any).term ??
                        (it as any).sourceMarker,
                        (it as any).target ??
                        (it as any).tgt ??
                        (it as any).translation ??
                        (it as any).targetMarker,
                        (it as any).score ?? (it as any).alignment
                    );
                } else if (typeof it === 'string') {
                    // try split by arrow
                    const m = it.split(/=>|→|->/);
                    if (m.length >= 2) push(m[0], m.slice(1).join('=>'));
                    else push(it, '');
                }
            }
        }
        return out;
    }

    function buildDislikedPrompt(
        pairs: Array<{ source: string; target: string }>,
        dislikedMap: Record<string, boolean>
    ): string | undefined {
        const dislikedList: Array<{ source: string; target: string }> = [];
        pairs.forEach((p, i) => {
            const key = `${p.source}::${p.target}::${i}`;
            if (dislikedMap[key]) dislikedList.push({ source: p.source, target: p.target });
        });
        if (!dislikedList.length) return undefined;
        const lines = dislikedList
            .map(x => t('dislikedPairFormat', { source: x.source, target: x.target }))
            .join('\n');
        return t('dislikedPairWarning', { lines });
    }

    // 当原文变化且尚无基线时，自动生成一次基线翻译
    useEffect(() => {
        if (sourceText && (baseline === null || baseline === '')) {
            const plain = String(preTranslation || '') || String(targetText || '');
            setBaseline(plain);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sourceText]);

    // 根据当前译文识别已应用的是基线还是嵌入；若都存在且当前未匹配，则默认选中嵌入
    useEffect(() => {
        const cur = String(targetText || '');
        const base = String(baseline || '');
        const emb = String(qaEmbeddedText || '');
        if (emb && cur === emb) {
            setAppliedKind('embedded');
        } else if (base && cur === base) {
            setAppliedKind('baseline');
        } else if (emb) {
            setAppliedKind('embedded');
        } else if (base) {
            setAppliedKind('baseline');
        } else {
            setAppliedKind(null);
        }
    }, [targetText, baseline, qaEmbeddedText]);

    return (
        <div className="flex size-full flex-col rounded border border-purple-200 bg-purple-50 p-2 dark:border-purple-800 dark:bg-purple-950/30">
            <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-foreground/70">{t('headerSyntaxQA')}</div>
            </div>

            {/* 三栏布局（双语对齐 / 句法建议 / 术语嵌入译文） */}
            <ResizablePanelGroup
                direction="horizontal"
                className="mt-2 h-full items-stretch"
                onLayout={(sizes: number[]) => {
                    try {
                        document.cookie = `react-resizable-panels:qa-review-layout=${JSON.stringify(sizes)}`;
                    } catch { }
                }}
            >
                {/* 双语句法评估 */}
                <ResizablePanel
                    defaultSize={33}
                    minSize={20}
                    className={cn('rounded bg-white p-2 dark:bg-slate-900', panelCls)}
                >
                    <div className="mb-1 text-[11px] font-semibold text-foreground">
                        {t('headerSyntaxQA')}
                    </div>
                    {(() => {
                        const bi = asJson(qaBiTerm);
                        const pairs: Array<{ source: string; target: string; score?: number }> =
                            normalizePairs(qaBiTerm).map(p => ({
                                source: p.source,
                                target: p.target,
                                score: p.score,
                            }));
                        const coverage: number | undefined =
                            typeof bi?.coverage === 'number' ? bi.coverage : undefined;
                        if (!bi)
                            return <div className="text-xs text-foreground/60">{t('notRun')}</div>;
                        return (
                            <div className="space-y-2 overflow-auto text-xs">
                                {typeof coverage === 'number' && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-foreground/60">{t('coverage')}</span>
                                        <div className="h-1.5 w-40 rounded bg-slate-200">
                                            <div
                                                className="h-1.5 rounded bg-purple-500"
                                                style={{
                                                    width: `${Math.max(0, Math.min(100, Math.round(coverage * 100)))}%`,
                                                }}
                                            />
                                        </div>
                                        <span className="text-foreground/70">
                                            {Math.round(coverage * 100)}%
                                        </span>
                                    </div>
                                )}
                                {pairs.length ? (
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="text-foreground/60">
                                                <th className="w-1/3 px-2 py-1 text-left font-normal">
                                                    {t('colSourceTerm')}
                                                </th>
                                                <th className="w-1/3 px-2 py-1 text-left font-normal">
                                                    {t('colAlignedTranslation')}
                                                </th>
                                                <th className="px-2 py-1 text-left font-normal">
                                                    {t('colScore')}
                                                </th>
                                                <th className="w-[60px] px-2 py-1 text-left text-center font-normal">
                                                    {t('colDislike')}
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {pairs.map((p, i) => {
                                                const key = `${p.source}::${p.target}::${i}`;
                                                const noted = notedTerms[p.source] === true;
                                                const rowCls = cn(
                                                    'border-t',
                                                    noted
                                                        ? 'bg-purple-50/70 dark:bg-purple-900/20'
                                                        : ''
                                                );
                                                const disliked =
                                                    (dislikedPairs || {})[key] === true;
                                                const toggleDislike = async () => {
                                                    const prev = dislikedPairs || {};
                                                    const next = {
                                                        ...prev,
                                                        [key]: !(prev[key] === true),
                                                    };
                                                    setQADislikedPairs(next);
                                                    const docId = (activeDocumentItem as any)?.id;
                                                    if (docId) {
                                                        try {
                                                            await saveQualityAssureResultsAction(
                                                                docId,
                                                                { dislikedPairs: next }
                                                            );
                                                        } catch { }
                                                    }
                                                };
                                                const onToggle = () => toggleNote(p.source);
                                                return (
                                                    <tr
                                                        key={key}
                                                        className={rowCls}
                                                        onClick={onToggle}
                                                        role="button"
                                                        tabIndex={0}
                                                        onKeyDown={e => {
                                                            if (
                                                                e.key === 'Enter' ||
                                                                e.key === ' '
                                                            ) {
                                                                e.preventDefault();
                                                                onToggle();
                                                            }
                                                        }}
                                                    >
                                                        <td className="break-words px-2 py-1 align-top">
                                                            {p.source}
                                                        </td>
                                                        <td className="break-words px-2 py-1 align-top">
                                                            {p.target}
                                                        </td>
                                                        <td className="px-2 py-1 align-top">
                                                            {typeof p.score === 'number' ? (
                                                                <div className="flex items-center gap-2">
                                                                    <div className="h-1 w-20 rounded bg-slate-200">
                                                                        <div
                                                                            className="h-1 rounded bg-emerald-500"
                                                                            style={{
                                                                                width: `${Math.max(0, Math.min(100, Math.round(p.score * 100)))}%`,
                                                                            }}
                                                                        />
                                                                    </div>
                                                                    <span className="text-foreground/70">
                                                                        {Math.round(p.score * 100)}%
                                                                    </span>
                                                                </div>
                                                            ) : (
                                                                <span className="text-foreground/60">
                                                                    —
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td
                                                            className="px-2 py-1 text-center align-top"
                                                            onClick={e => {
                                                                e.stopPropagation();
                                                                toggleDislike();
                                                            }}
                                                        >
                                                            <button
                                                                className={cn(
                                                                    'inline-flex items-center justify-center rounded border p-1',
                                                                    disliked
                                                                        ? 'border-red-300 bg-red-50 text-red-600'
                                                                        : 'border-slate-200 text-foreground/60 hover:bg-muted'
                                                                )}
                                                                title={
                                                                    disliked
                                                                        ? t('markedAsPoor')
                                                                        : t('markAsPoor')
                                                                }
                                                            >
                                                                <ThumbsDown className="h-3.5 w-3.5" />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                ) : (
                                    <div className="text-foreground/60">{t('noPairs')}</div>
                                )}
                            </div>
                        );
                    })()}
                </ResizablePanel>
                <ResizableHandle withHandle className="bg-transparent" />

                {/* 句法特征评估 */}
                <ResizablePanel
                    defaultSize={33}
                    minSize={20}
                    className={cn('rounded bg-white p-2 dark:bg-slate-900', panelCls)}
                >
                    <div className="mb-1 text-[11px] font-semibold text-foreground">
                        {t('syntaxFeatureAssessment')}
                    </div>
                    {(() => {
                        const syn = asJson(qaSyntax);
                        const issues: Array<{ type: string; span?: string; advice?: string }> =
                            syn?.issues || [];
                        const selectedMap: Record<string, boolean> = (syn?.selectedMap ||
                            {}) as Record<string, boolean>;
                        const makeKey = (
                            it: { type?: string; span?: string; advice?: string },
                            idx: number
                        ) => {
                            const t = String(it?.type || '')
                                .trim()
                                .toLowerCase();
                            const s = String(it?.span || '')
                                .trim()
                                .toLowerCase();
                            const a = String(it?.advice || '')
                                .trim()
                                .toLowerCase();
                            // 采用内容派生的键，避免重排导致的索引漂移
                            return `${t}|${s}|${a}` || `idx:${idx}`;
                        };
                        const toggleSelect = async (key: string) => {
                            try {
                                const nextSelected = !(selectedMap?.[key] === true);
                                const nextMap = {
                                    ...(selectedMap || {}),
                                    [key]: nextSelected,
                                } as Record<string, boolean>;
                                const nextSyn = { ...(syn || {}), selectedMap: nextMap } as any;
                                setQAOutputs({ syntax: nextSyn });
                                const docId = (activeDocumentItem as any)?.id;
                                if (docId) {
                                    try {
                                        await saveQualityAssureResultsAction(docId, {
                                            syntax: nextSyn,
                                        });
                                    } catch { }
                                }
                            } catch { }
                        };
                        if (!syn)
                            return (
                                <div className="text-xs text-foreground/60">{t('notDetected')}</div>
                            );
                        return (
                            <div className="space-y-1 overflow-auto text-xs">
                                {issues.length ? (
                                    issues.map((it, i) => {
                                        const key = makeKey(it, i);
                                        const checked = selectedMap?.[key] === true;
                                        return (
                                            <div
                                                key={key}
                                                className={cn(
                                                    'flex cursor-pointer items-start gap-2 rounded border px-2 py-1 hover:border-emerald-300/60',
                                                    checked
                                                        ? 'border-emerald-300 bg-emerald-50/40 dark:bg-emerald-900/10'
                                                        : ''
                                                )}
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => toggleSelect(key)}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault();
                                                        toggleSelect(key);
                                                    }
                                                }}
                                            >
                                                <span className="whitespace-nowrap rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">
                                                    {it.type || t('issueTag')}
                                                </span>
                                                <div className="flex-1">
                                                    {it.span && (
                                                        <div className="break-words text-foreground/80">
                                                            {it.span}
                                                        </div>
                                                    )}
                                                    {it.advice && (
                                                        <div className="text-foreground/60">
                                                            {t('advicePrefix')} {it.advice}
                                                        </div>
                                                    )}
                                                </div>
                                                {checked && (
                                                    <div className="pl-2 pt-0.5 text-emerald-600">
                                                        <Check className="h-4 w-4" />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="text-foreground/60">
                                        No obvious issues found
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                </ResizablePanel>
                <ResizableHandle withHandle className="bg-transparent" />
                {/* 句法嵌入翻译 */}
                <ResizablePanel
                    defaultSize={34}
                    minSize={20}
                    className={cn('flex-1 rounded bg-white p-2 dark:bg-slate-900', panelCls)}
                >
                    <div className="flex items-center justify-between">
                        <div className="mb-1 text-[11px] font-semibold text-foreground">
                            {t('syntaxEmbedding')}
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1 text-[11px] text-foreground/70">
                                <input
                                    type="checkbox"
                                    disabled={!baseline && !qaEmbeddedText}
                                    checked={!!showDiff}
                                    onChange={() => setShowDiff(v => !v)}
                                />
                                {t('showDiff')}
                            </label>
                            <Button
                                size="sm"
                                className="h-6 px-2 py-0 text-[11px]"
                                onClick={genSyntaxEmbedded}
                                disabled={loadingEmbedded}
                                title={t('reEmbedTitle')}
                            >
                                {loadingEmbedded ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        <span className="whitespace-nowrap">{t('generating')}</span>
                                    </>
                                ) : (
                                    t('reEmbed')
                                )}
                            </Button>
                        </div>
                    </div>

                    {(() => {
                        const a = String(baseline || '');
                        const b = String(qaEmbeddedText || '');
                        const hasAny = (a && a.length > 0) || (b && b.length > 0);
                        const d =
                            showDiff && baseline !== null && qaEmbeddedText !== null
                                ? wordDiff(a, b)
                                : null;
                        return (
                            <div className="mt-4 space-y-2 overflow-auto text-xs">
                                {!hasAny && (
                                    <div className="text-foreground/60">{t('noResults')}</div>
                                )}
                                {hasAny && (
                                    <>
                                        <div
                                            className={cn(
                                                'cursor-pointer rounded-md border bg-muted/30 p-2 transition-colors hover:border-emerald-300/60',
                                                appliedKind === 'baseline'
                                                    ? 'border-emerald-400 bg-emerald-50/40 dark:bg-emerald-900/10'
                                                    : 'border-slate-200 dark:border-slate-800'
                                            )}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => {
                                                if (a) {
                                                    applyToTarget(String(a));
                                                    setAppliedKind('baseline');
                                                }
                                            }}
                                            onKeyDown={e => {
                                                if ((e.key === 'Enter' || e.key === ' ') && a) {
                                                    e.preventDefault();
                                                    applyToTarget(String(a));
                                                    setAppliedKind('baseline');
                                                }
                                            }}
                                        >
                                            <div className="mb-1 flex w-full items-center justify-between text-[11px]">
                                                <div
                                                    className={cn(
                                                        'flex w-full items-center justify-between gap-2',
                                                        appliedKind === 'baseline'
                                                            ? 'text-emerald-700 dark:text-emerald-300'
                                                            : 'text-foreground/60'
                                                    )}
                                                >
                                                    <span>{t('termEmbeddedTranslation')}</span>
                                                    {appliedKind === 'baseline' && (
                                                        <Badge
                                                            variant="outline"
                                                            className="h-4 border-emerald-300 px-1 py-0 text-[10px] text-emerald-700"
                                                        >
                                                            {t('applied')}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="whitespace-pre-wrap break-words">
                                                {d ? (
                                                    d.baseline.map((t, idx) => {
                                                        const isSpace = /^\s+$/.test(t.text);
                                                        if (t.type === 'del' && !isSpace) {
                                                            return (
                                                                <mark
                                                                    key={idx}
                                                                    className="rounded-[2px] bg-red-100/70 font-normal text-red-800 ring-1 ring-red-200"
                                                                >
                                                                    {t.text}
                                                                </mark>
                                                            );
                                                        }
                                                        return (
                                                            <span
                                                                key={idx}
                                                                className="text-foreground/80"
                                                            >
                                                                {t.text}
                                                            </span>
                                                        );
                                                    })
                                                ) : (
                                                    <span className="text-foreground/80">
                                                        {a.slice(0, 2000)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        {qaEmbeddedText !== null && (
                                            <div
                                                className={cn(
                                                    'cursor-pointer rounded-md border bg-muted/30 p-2 transition-colors hover:border-emerald-300/60',
                                                    appliedKind === 'embedded'
                                                        ? 'border-emerald-400 bg-emerald-50/40 dark:bg-emerald-900/10'
                                                        : 'border-slate-200 dark:border-slate-800'
                                                )}
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => {
                                                    if (b) {
                                                        applyToTarget(String(b));
                                                        setAppliedKind('embedded');
                                                    }
                                                }}
                                                onKeyDown={e => {
                                                    if ((e.key === 'Enter' || e.key === ' ') && b) {
                                                        e.preventDefault();
                                                        applyToTarget(String(b));
                                                        setAppliedKind('embedded');
                                                    }
                                                }}
                                            >
                                                <div className="mb-1 flex w-full items-center justify-between text-[11px]">
                                                    <div
                                                        className={cn(
                                                            'flex w-full items-center justify-between gap-2',
                                                            appliedKind === 'embedded'
                                                                ? 'text-emerald-700 dark:text-emerald-300'
                                                                : 'text-foreground/60'
                                                        )}
                                                    >
                                                        <span>{t('syntaxAdviceEmbedded')}</span>
                                                        {appliedKind === 'embedded' && (
                                                            <Badge
                                                                variant="outline"
                                                                className="h-4 border-emerald-300 px-1 py-0 text-[10px] text-emerald-700"
                                                            >
                                                                {t('applied')}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="whitespace-pre-wrap break-words">
                                                    {d ? (
                                                        d.embedded.map((t, idx) => {
                                                            const isSpace = /^\s+$/.test(t.text);
                                                            if (t.type === 'ins' && !isSpace) {
                                                                return (
                                                                    <mark
                                                                        key={idx}
                                                                        className="rounded-[2px] bg-emerald-100/70 font-normal text-emerald-800 ring-1 ring-emerald-200"
                                                                    >
                                                                        {t.text}
                                                                    </mark>
                                                                );
                                                            }
                                                            return (
                                                                <span
                                                                    key={idx}
                                                                    className="text-foreground/80"
                                                                >
                                                                    {t.text}
                                                                </span>
                                                            );
                                                        })
                                                    ) : (
                                                        <span className="text-foreground/80">
                                                            {b.slice(0, 2000)}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        );
                    })()}
                </ResizablePanel>
            </ResizablePanelGroup>
        </div>
    );
}
