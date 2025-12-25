'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAgentWorkflowSteps } from '@/hooks/useAgentWorkflowSteps';
import { useActiveDocumentItem } from '@/hooks/useActiveDocumentItem';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { TermBadge, AddTermBadge } from '../components/TermBadge';
import { toast } from 'sonner';
import { wordDiff } from '@/lib/text-diff';
import {
    findProjectDictionaryAction,
    createDictionaryEntryAction,
    updateDictionaryEntryAction,
    fetchDictionaryMetaByIdAction,
} from '@/actions/dictionary';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import {
    runPreTranslateAction,
    embedAndTranslateAction,
    baselineTranslateAction,
} from '@/actions/pre-translate';
import { useTranslationContent, useTranslationLanguage } from '@/hooks/useTranslation';
import { getLanguageByCode, getLanguageLabelByCode } from '@/utils/translate';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Loader2, Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function PreTranslatePanel() {
    const t = useTranslations('IDE.mtReview');
    const tCommon = useTranslations('Common');
    const terms = useAgentWorkflowSteps(s => s.preTranslateTerms);
    const dict = useAgentWorkflowSteps(s => s.preTranslateDict);
    const embedded = useAgentWorkflowSteps(s => s.preTranslateEmbedded);
    const setPreOutputs = useAgentWorkflowSteps(s => s.setPreOutputs);
    const enabledMap = useAgentWorkflowSteps(s => s.preTermEnabled) || {};
    const dictEnabledMap = useAgentWorkflowSteps(s => s.preDictEnabled) || {};
    const setTermEnabled = useAgentWorkflowSteps(s => s.setPreTermEnabled);
    const setRowEnabled = useAgentWorkflowSteps(s => s.setPreDictEnabled);

    const { activeDocumentItem } = useActiveDocumentItem();
    const params = useParams<{ id: string }>();
    const projectId = String(params?.id || '');
    // 不再优先读 DB，仅在初始为空时可按需恢复（本次先移除 DB 读取）
    const [addingTerm, setAddingTerm] = useState(false);
    const [newTerm, setNewTerm] = useState('');

    const { sourceText, targetText, setTargetTranslationText } = useTranslationContent();
    const { sourceLanguage, targetLanguage } = useTranslationLanguage();
    const [baseline, setBaseline] = useState<string | null>(null);
    const [loadingBaseline, setLoadingBaseline] = useState(false);
    const [showDiff, setShowDiff] = useState(false);
    const [loadingEmbedded, setLoadingEmbedded] = useState(false);
    const [appliedKind, setAppliedKind] = useState<'baseline' | 'embedded' | null>(null);

    // 词典编辑状态
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState<string>('');

    const applyToTarget = async (text: string) => {
        try {
            const content = String(text || '');
            setTargetTranslationText(content);
            toast.success(t('applied'));
        } catch {
            toast.error(t('applyFailed'));
        }
    };

    const genBaseline = async () => {
        try {
            if (!sourceText) {
                toast.error(t('noSourceForBaseline'));
                return;
            }
            setLoadingBaseline(true);
            const baselineResult = await baselineTranslateAction(
                sourceText,
                sourceLanguage || 'auto',
                targetLanguage || 'auto',
                { prompt: undefined }
            );
            const baselineText = baselineResult || '';
            setBaseline(baselineText);
        } catch (e: any) {
            toast.error(String(e?.message || t('baselineGenerationFailed')));
        } finally {
            setLoadingBaseline(false);
        }
    };

    const genEmbedded = async () => {
        try {
            if (!sourceText) {
                toast.error(t('noSourceForEmbedding'));
                return;
            }
            setLoadingEmbedded(true);
            // 仅传递启用术语且已启用的词典项
            const dictArr = Array.isArray(dict) ? (dict as any[]) : [];
            const filtered = dictArr
                .filter(row => {
                    const termKey = String((row as any)?.term || '');
                    if (!termKey) return false;
                    const rowId = String((row as any)?.id || (termKey ? `temp:${termKey}` : ''));
                    const termEnabled = enabledMap[termKey] !== false;
                    const rowEnabled = dictEnabledMap[rowId] !== false;
                    return termEnabled && rowEnabled;
                })
                .map(row => ({
                    term: String((row as any)?.term || ''),
                    translation: String((row as any)?.translation || ''),
                }))
                .filter(x => x.term);
            console.log('genEmbedded', filtered);
            const embeddedText = await embedAndTranslateAction(
                sourceText,
                sourceLanguage || 'auto',
                targetLanguage || 'auto',
                filtered
            );
            setPreOutputs({ terms, dict, translation: embeddedText });
            if (baseline) setShowDiff(true);
        } catch (e: any) {
            toast.error(String(e?.message || t('embeddingGenerationFailed')));
        } finally {
            setLoadingEmbedded(false);
        }
    };

    // 当原文变化且尚无基线时，自动生成一次基线
    useEffect(() => {
        if (sourceText && !loadingBaseline && (baseline === null || baseline === '')) {
            genBaseline();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sourceText]);

    // 根据当前译文识别已应用的是基线还是嵌入
    useEffect(() => {
        const cur = String(targetText || '');
        const base = String(baseline || '');
        const emb = String(embedded || '');
        if (base && cur === base) setAppliedKind('baseline');
        else if (emb && cur === emb) setAppliedKind('embedded');
        else setAppliedKind(null);
    }, [targetText, baseline, embedded]);

    // diff helpers moved to shared util

    // 当文档切换时：如需清空可在外部完成；此处不再主动读 DB 恢复

    const panelCls = 'border border-slate-200 dark:border-slate-800';

    return (
        <div className="flex h-full w-full flex-col rounded border border-blue-200 bg-blue-50 p-2 dark:border-blue-800 dark:bg-blue-950/30">
            <div className="text-xs font-medium text-foreground/70">{t('title')}</div>
            <ResizablePanelGroup
                direction="horizontal"
                className="mt-2 h-full items-stretch"
                onLayout={(sizes: number[]) => {
                    try {
                        document.cookie = `react-resizable-panels:mt-review-layout=${JSON.stringify(sizes)}`;
                    } catch {}
                }}
            >
                <ResizablePanel
                    defaultSize={20}
                    minSize={10}
                    className={cn('rounded bg-white p-2 dark:bg-slate-900', panelCls)}
                >
                    <div className="flex items-center justify-between">
                        <div className="mb-1 text-[11px] font-semibold text-foreground">
                            {t('termExtraction')}
                        </div>
                        <div className="mb-1 text-xs text-foreground/60">
                            {t('total')} {terms?.length || 0} {t('items')}
                        </div>
                    </div>
                    <div className="flex-1 overflow-auto text-xs">
                        {Array.isArray(terms) && terms.length ? (
                            (() => {
                                const normalized = (terms as any[])
                                    .map(t => {
                                        if (typeof t === 'string')
                                            return {
                                                term: t,
                                                score: undefined as number | undefined,
                                            };
                                        if (t && typeof t === 'object')
                                            return {
                                                term: String(
                                                    (t as any).term ?? (t as any).source ?? ''
                                                ),
                                                score: (t as any).score,
                                            };
                                        return { term: '', score: undefined };
                                    })
                                    .filter(x => x.term);
                                const unique: Record<string, { term: string; score?: number }> = {};
                                for (const x of normalized) if (!unique[x.term]) unique[x.term] = x;
                                const list = Object.values(unique).sort(
                                    (a, b) => (b.score || 0) - (a.score || 0)
                                );
                                const handleCopy = async (text: string) => {
                                    try {
                                        await navigator.clipboard.writeText(text);
                                        toast.success(t('copied', { text }));
                                    } catch {}
                                };

                                const dictArr = Array.isArray(dict) ? (dict as any[]) : [];
                                const originByTerm = new Map<string, string | undefined>();
                                for (const row of dictArr) {
                                    const t = String((row as any)?.term || '');
                                    if (!t) continue;
                                    const o = (row as any)?.origin as string | undefined;
                                    originByTerm.set(t, o);
                                }

                                // 现有术语集合用于去重
                                const existingTerms = new Set(list.map(t => t.term));
                                return (
                                    <div>
                                        <div className="flex flex-wrap gap-1">
                                            {list.map(x => {
                                                const enabled = enabledMap[x.term] !== false;
                                                const origin = originByTerm.get(x.term);
                                                const hasHit =
                                                    typeof origin === 'string' && origin.length > 0;
                                                const handleToggle = () => {
                                                    const nextEnabled = !enabled;
                                                    setTermEnabled(x.term, nextEnabled);
                                                    const dictArr = Array.isArray(dict)
                                                        ? (dict as any[])
                                                        : [];
                                                    const hasHit = dictArr.some(
                                                        r =>
                                                            String((r as any)?.term || '') ===
                                                            x.term
                                                    );
                                                    if (nextEnabled) {
                                                        if (!hasHit) {
                                                            const tempRow = {
                                                                id: `temp:${x.term}`,
                                                                term: x.term,
                                                                translation: '',
                                                                origin: undefined,
                                                                source: t('temporaryEntry'),
                                                            };
                                                            setPreOutputs({
                                                                terms,
                                                                dict: [...dictArr, tempRow] as any,
                                                                translation: embedded,
                                                            });
                                                        }
                                                    } else {
                                                        // 取消启用时移除临时新增项
                                                        if (hasHit) {
                                                            const filtered = dictArr.filter(
                                                                r =>
                                                                    !(
                                                                        String(
                                                                            (r as any)?.id || ''
                                                                        ).startsWith('temp:') &&
                                                                        String(
                                                                            (r as any)?.term || ''
                                                                        ) === x.term
                                                                    )
                                                            );
                                                            if (filtered.length !== dictArr.length)
                                                                setPreOutputs({
                                                                    terms,
                                                                    dict: filtered as any,
                                                                    translation: embedded,
                                                                });
                                                        }
                                                    }
                                                };
                                                return (
                                                    <TermBadge
                                                        key={x.term}
                                                        term={x.term}
                                                        score={x.score}
                                                        enabled={enabled}
                                                        isHit={hasHit}
                                                        origin={origin}
                                                        onToggle={handleToggle}
                                                        onCopy={() => handleCopy(x.term)}
                                                    />
                                                );
                                            })}
                                            <AddTermBadge
                                                adding={addingTerm}
                                                value={newTerm}
                                                setAdding={setAddingTerm}
                                                setValue={setNewTerm}
                                                onSubmit={val => {
                                                    const v = val.trim();
                                                    if (!v) return;
                                                    const exists = list.some(t => t.term === v);
                                                    if (exists) {
                                                        toast.error(t('termExists'));
                                                        return;
                                                    }
                                                    setPreOutputs({
                                                        terms: [
                                                            ...(terms || []),
                                                            { term: v, score: 1 },
                                                        ],
                                                        dict,
                                                        translation: embedded,
                                                    });
                                                }}
                                            />
                                        </div>
                                    </div>
                                );
                            })()
                        ) : (
                            <div className="text-foreground/60">{t('noResults')}</div>
                        )}
                    </div>
                </ResizablePanel>
                <ResizableHandle withHandle className="bg-transparent" />
                <ResizablePanel
                    defaultSize={40}
                    minSize={20}
                    className={cn('rounded bg-white p-2 dark:bg-slate-900', panelCls)}
                >
                    <div className="flex items-center justify-between">
                        <div className="mb-1 text-[11px] font-semibold text-foreground">
                            {t('dictionaryQuery')}
                        </div>
                        {(() => {
                            const dictArr = Array.isArray(dict) ? (dict as any[]) : [];
                            const enabledCount = dictArr.filter(
                                r => enabledMap[String((r as any)?.term || '')] !== false
                            ).length;
                            return (
                                <div className="mb-1 text-xs text-foreground/60">
                                    {t('total')} {enabledCount} {t('items')}
                                </div>
                            );
                        })()}
                    </div>
                    {Array.isArray(dict) && dict.length ? (
                        (() => {
                            const filtered = (dict as any[]).filter(
                                r => enabledMap[String((r as any)?.term || '')] !== false
                            );
                            const startEdit = (row: any) => {
                                setEditingId(String(row.id || ''));
                                setEditValue(String(row.translation || ''));
                            };
                            const cancelEdit = () => {
                                setEditingId(null);
                                setEditValue('');
                            };
                            const saveEdit = async (row: any) => {
                                try {
                                    const idStr = String(row.id || '');
                                    if (idStr.startsWith('temp:')) {
                                        if (!projectId) throw new Error(t('missingProjectId'));
                                        const fp = (await findProjectDictionaryAction(
                                            projectId
                                        )) as any;
                                        if (!fp?.success || !fp?.data?.id)
                                            throw new Error(t('cannotLocateProjectDict'));
                                        const created = (await createDictionaryEntryAction({
                                            dictionaryId: fp.data.id,
                                            sourceText: String(row.term || ''),
                                            targetText: String(editValue || ''),
                                            origin: 'apply:user',
                                        })) as any;
                                        if (!created?.success || !created?.data?.id)
                                            throw new Error(created?.error || t('createFailed'));
                                        // 获取词库元信息用于展示来源
                                        let sourceLabel = t('projectDictionary');
                                        try {
                                            const metaRes = (await fetchDictionaryMetaByIdAction(
                                                fp.data.id
                                            )) as any;
                                            const meta = metaRes?.data;
                                            if (meta) {
                                                const visMap: Record<string, string> = {
                                                    PUBLIC: t('public'),
                                                    PROJECT: t('project'),
                                                    PRIVATE: t('private'),
                                                };
                                                const vis =
                                                    visMap[
                                                        String(meta.visibility || '').toUpperCase()
                                                    ] || t('project');
                                                const name = String(meta.name || '');
                                                sourceLabel = `${vis} · ${name} · ${t('termList')}`;
                                            }
                                        } catch {}
                                        // 本地替换临时项为持久项（避免直接修改只读对象）
                                        const dictArr = Array.isArray(dict) ? (dict as any[]) : [];
                                        const updated = dictArr.map(r => {
                                            const rid = String((r as any)?.id || '');
                                            if (rid === idStr) {
                                                return {
                                                    ...r,
                                                    id: created.data.id,
                                                    dictionaryId: fp.data.id,
                                                    translation: editValue,
                                                    source: sourceLabel,
                                                };
                                            }
                                            return r;
                                        });
                                        setPreOutputs({
                                            terms,
                                            dict: updated as any,
                                            translation: embedded,
                                        });
                                        toast.success(t('savedToProjectDict'));
                                        cancelEdit();
                                    } else {
                                        const res = (await updateDictionaryEntryAction(
                                            String(row.id),
                                            { targetText: editValue }
                                        )) as any;
                                        if (!res?.success)
                                            throw new Error(res?.error || t('saveFailed'));
                                        toast.success(t('savedDictTranslation'));
                                        // 更新本地词典译文（避免直接修改只读对象）
                                        const dictArr = Array.isArray(dict) ? (dict as any[]) : [];
                                        const updated = dictArr.map(r => {
                                            const rid = String((r as any)?.id || '');
                                            if (rid === String(row.id || '')) {
                                                return { ...r, translation: editValue };
                                            }
                                            return r;
                                        });
                                        setPreOutputs({
                                            terms,
                                            dict: updated as any,
                                            translation: embedded,
                                        });
                                        cancelEdit();
                                    }
                                } catch (e: any) {
                                    toast.error(e?.message || t('saveFailed'));
                                }
                            };

                            const rows = Array.isArray(filtered) ? filtered : [];
                            const regular = rows.filter(
                                r => !String((r as any)?.id || '').startsWith('temp:')
                            );
                            const temps = rows.filter(r =>
                                String((r as any)?.id || '').startsWith('temp:')
                            );

                            const renderRow = (row: any, key: string, idx: number) => {
                                const isTemp = String((row as any)?.id || '').startsWith('temp:');
                                const trCls = isTemp
                                    ? 'border-t bg-amber-50/60 dark:bg-amber-900/20'
                                    : 'border-t';
                                const translation = String(row.translation || '');
                                const termKey = String(row.term || '');
                                const enabled = enabledMap[termKey] !== false;
                                return (
                                    <tr key={key} className={trCls}>
                                        <td className="break-words px-2 py-1 align-top">
                                            <div className="flex items-center gap-2">
                                                <span>{String(row.term || '')}</span>
                                                {isTemp && (
                                                    <Badge
                                                        variant="outline"
                                                        className="h-4 whitespace-nowrap border-amber-300 px-1 py-0 text-[10px] text-amber-700 dark:border-amber-600 dark:text-amber-200"
                                                    >
                                                        {t('unsaved')}
                                                    </Badge>
                                                )}
                                            </div>
                                        </td>
                                        <td className="break-words px-2 py-1 align-top">
                                            {editingId === String(row.id || '') ? (
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        className="w-full rounded border px-1 py-0.5 text-xs"
                                                        value={editValue}
                                                        onChange={e => setEditValue(e.target.value)}
                                                    />
                                                    <button
                                                        className="rounded p-1 text-emerald-600 hover:bg-emerald-50"
                                                        onClick={() => saveEdit(row)}
                                                        title={t('save')}
                                                    >
                                                        <Check className="h-4 w-4" />
                                                    </button>
                                                    <button
                                                        className="rounded p-1 text-foreground/60 hover:bg-muted"
                                                        onClick={cancelEdit}
                                                        title={t('cancel')}
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            ) : translation ? (
                                                <span
                                                    className="cursor-pointer underline-offset-2 hover:underline"
                                                    onClick={() => startEdit(row)}
                                                    title={t('clickToEditTranslation')}
                                                >
                                                    {translation}
                                                </span>
                                            ) : (
                                                <span
                                                    className="cursor-pointer italic text-foreground/50 underline-offset-2 hover:underline"
                                                    onClick={() => startEdit(row)}
                                                    title={t('clickToFillTranslation')}
                                                >
                                                    {t('pending')}
                                                </span>
                                            )}
                                        </td>
                                        <td className="break-words px-2 py-1 align-top text-foreground/70">
                                            {String(row.source || '')}
                                        </td>
                                        <td className="px-2 py-1 align-top">
                                            <Switch
                                                className="scale-90"
                                                checked={(() => {
                                                    const rowId = String(row.id || `${key}-${idx}`);
                                                    return dictEnabledMap[rowId] !== false;
                                                })()}
                                                onCheckedChange={async next => {
                                                    const rowId = String(row.id || `${key}-${idx}`);
                                                    const prev = dictEnabledMap[rowId] !== false;
                                                    setRowEnabled(rowId, !!next);
                                                    try {
                                                        const idStr = String(row.id || '');
                                                        if (idStr.startsWith('temp:')) {
                                                            toast.error(t('saveTempEntryFirst'));
                                                            return;
                                                        }
                                                        const res =
                                                            (await updateDictionaryEntryAction(
                                                                idStr,
                                                                { enabled: !!next }
                                                            )) as any;
                                                        if (!res?.success)
                                                            throw new Error(
                                                                res?.error || t('saveFailed')
                                                            );
                                                        const srcLabel = String(
                                                            (row as any)?.source || ''
                                                        ).trim();
                                                        const dictId = String(
                                                            (row as any)?.dictionaryId || ''
                                                        ).trim();
                                                        const lib =
                                                            srcLabel ||
                                                            (dictId
                                                                ? `${t('dictId')}:${dictId}`
                                                                : '');
                                                        toast.success(
                                                            `${next ? t('enabled') : t('disabled')}${t('term')}：${row.term}${lib ? `（${lib}）` : ''}`
                                                        );
                                                    } catch (e: any) {
                                                        setRowEnabled(rowId, prev);
                                                        toast.error(
                                                            e?.message || t('saveStatusFailed')
                                                        );
                                                    }
                                                }}
                                                title={(() => {
                                                    const rowId = String(row.id || `${key}-${idx}`);
                                                    return dictEnabledMap[rowId] !== false
                                                        ? t('disableThisTerm')
                                                        : t('enableThisTerm');
                                                })()}
                                            />
                                        </td>
                                    </tr>
                                );
                            };

                            return (
                                <div className="h-full overflow-auto text-xs">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="text-foreground/60">
                                                <th className="w-1/3 px-2 py-1 text-left font-normal">
                                                    {t('term')}
                                                </th>
                                                <th className="w-1/3 px-2 py-1 text-left font-normal">
                                                    {t('suggestedTranslation')}
                                                </th>
                                                <th className="px-2 py-1 text-left font-normal">
                                                    {t('source')}
                                                </th>
                                                <th className="w-10 px-2 py-1 text-left font-normal">
                                                    {t('enable')}
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {regular.length > 0 && (
                                                <tr className="bg-muted/40">
                                                    <td
                                                        className="px-2 py-1 text-[11px] text-foreground/60"
                                                        colSpan={4}
                                                    >
                                                        {t('dictionaryHits')}
                                                    </td>
                                                </tr>
                                            )}
                                            {regular.map((row, idx) =>
                                                renderRow(
                                                    row,
                                                    `reg-${row.id || row.term}-${idx}`,
                                                    idx
                                                )
                                            )}
                                            {temps.length > 0 && (
                                                <tr className="bg-amber-50/60 dark:bg-amber-900/20">
                                                    <td
                                                        className="px-2 py-1 text-[11px] text-amber-700 dark:text-amber-200"
                                                        colSpan={4}
                                                    >
                                                        {t('temporaryUnsaved')}
                                                    </td>
                                                </tr>
                                            )}
                                            {temps.map((row, idx) =>
                                                renderRow(
                                                    row,
                                                    `tmp-${row.id || row.term}-${idx}`,
                                                    idx
                                                )
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            );
                        })()
                    ) : (
                        <div className="max-h-56 overflow-auto text-xs text-foreground/60">
                            {t('noDictMatches')}
                        </div>
                    )}
                </ResizablePanel>
                <ResizableHandle withHandle className="bg-transparent" />
                <ResizablePanel
                    defaultSize={40}
                    minSize={20}
                    className={cn('flex-1 rounded bg-white p-2 dark:bg-slate-900', panelCls)}
                >
                    <div className="flex items-center justify-between">
                        <div className="mb-1 text-[11px] font-semibold text-foreground">
                            {t('termEmbeddedTranslation')}
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1 text-[11px] text-foreground/70">
                                <input
                                    type="checkbox"
                                    disabled={!baseline && !embedded}
                                    checked={!!showDiff}
                                    onChange={() => setShowDiff(v => !v)}
                                />
                                {t('showDifferences')}
                            </label>
                            <Button
                                size="sm"
                                className="h-6 px-2 py-0 text-[11px]"
                                onClick={genEmbedded}
                                disabled={loadingEmbedded}
                                title={t('generateTermEmbeddedTranslation')}
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
                        const b = String(embedded || '');
                        const hasAny = (a && a.length > 0) || (b && b.length > 0);
                        const d =
                            showDiff && baseline !== null && embedded !== null
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
                                                if (baseline) {
                                                    applyToTarget(String(baseline));
                                                    setAppliedKind('baseline');
                                                }
                                            }}
                                            onKeyDown={e => {
                                                if (
                                                    (e.key === 'Enter' || e.key === ' ') &&
                                                    baseline
                                                ) {
                                                    e.preventDefault();
                                                    applyToTarget(String(baseline));
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
                                                    <span>{t('noTermsApplied')}</span>
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
                                                if (embedded) {
                                                    applyToTarget(String(embedded));
                                                    setAppliedKind('embedded');
                                                }
                                            }}
                                            onKeyDown={e => {
                                                if (
                                                    (e.key === 'Enter' || e.key === ' ') &&
                                                    embedded
                                                ) {
                                                    e.preventDefault();
                                                    applyToTarget(String(embedded));
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
                                                    <span>{t('termsApplied')}</span>
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
