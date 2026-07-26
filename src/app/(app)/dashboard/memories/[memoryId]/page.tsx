'use client';

import {
    getMemoryByIdAction,
    getMemoryEntriesPagedAction,
    searchMemoryInLibraryAction,
} from '@/actions/memories';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
    meetsMemorySearchRelevanceThreshold,
    memorySearchPublicErrorMessage,
} from '@/lib/memory-search';
import {
    failedMemoryQueryView,
    isMemoryQueryViewCurrent,
    loadingMemoryQueryView,
    readyMemoryQueryView,
    resolveMemoryQueryView,
    type MemoryQueryRequest,
    type MemoryQueryViewState,
} from '@/lib/memory-query-view-state';
import {
    isMemoryVectorBackfillPendingState,
    isMemoryVectorBackfillWorkerProblem,
    normalizeMemoryVectorCoverage,
    type MemoryVectorCoverage,
} from '@/lib/memory-vector-backfill';
import { DEFAULT_HYBRID_CONFIG, HybridSearchConfig } from '@/types/hybrid-search';
import {
    AlertTriangle,
    CheckCircle2,
    Database,
    Eye,
    EyeOff,
    Loader2,
    RefreshCw,
    Search,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { SearchConfigPanel } from '../components/search-config-panel';
import { SearchResultItem } from '../components/search-result-item';

const VECTOR_BACKFILL_POLL_INTERVAL_MS = 1_500;
const VECTOR_BACKFILL_POLL_LIMIT = 90;

type VectorBackfillProgress = {
    progress: number;
    currentBatch: number | null;
    totalBatches: number | null;
};

type VectorBackfillStatus = {
    jobId: string;
    state: string;
    coverage: MemoryVectorCoverage;
    progress: VectorBackfillProgress | null;
    workerStatus: 'ready' | 'stale' | 'unavailable' | null;
};

type VectorBackfillView = {
    memoryId: string;
    status: 'loading' | 'ready' | 'error';
    data?: VectorBackfillStatus;
    notice?: 'status-unavailable' | 'request-failed';
};

type SubmittedMemorySearchSettings = {
    config: Partial<HybridSearchConfig>;
    configKey: string;
    similarityThreshold: number;
    maxResults: number;
    refreshVersion: number;
};

function snapshotMemorySearchConfig(
    config: Partial<HybridSearchConfig>
): Partial<HybridSearchConfig> {
    return {
        ...config,
        ...(config.vectorSearch ? { vectorSearch: { ...config.vectorSearch } } : {}),
        ...(config.keywordSearch ? { keywordSearch: { ...config.keywordSearch } } : {}),
        ...(config.fusionStrategy
            ? {
                  fusionStrategy: {
                      ...config.fusionStrategy,
                      ...(config.fusionStrategy.weights
                          ? { weights: { ...config.fusionStrategy.weights } }
                          : {}),
                      ...(config.fusionStrategy.rankFusion
                          ? { rankFusion: { ...config.fusionStrategy.rankFusion } }
                          : {}),
                  },
              }
            : {}),
    };
}

function boundedText(value: unknown, maxLength: number) {
    return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function nonNegativeSafeInteger(value: unknown) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function normalizedVectorBackfillProgress(value: unknown): VectorBackfillProgress | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    const progress = record.progress;
    if (typeof progress !== 'number' || !Number.isFinite(progress)) return null;
    const currentBatch = nonNegativeSafeInteger(record.currentBatch);
    const totalBatches = nonNegativeSafeInteger(record.totalBatches);
    return {
        progress: Math.max(0, Math.min(100, progress)),
        currentBatch,
        totalBatches,
    };
}

function parseVectorBackfillStatus(value: unknown): VectorBackfillStatus | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    const jobId = boundedText(record.jobId, 200);
    const state = boundedText(record.state, 40);
    const coverage = normalizeMemoryVectorCoverage(record.coverage);
    if (!jobId || !state || !coverage) return null;

    const worker = record.worker;
    const workerStatus =
        worker && typeof worker === 'object' && !Array.isArray(worker)
            ? isMemoryVectorBackfillWorkerProblem((worker as Record<string, unknown>).status) ||
              ((worker as Record<string, unknown>).status === 'ready' ? 'ready' : null)
            : null;

    return {
        jobId,
        state,
        coverage,
        progress: normalizedVectorBackfillProgress(record.progress),
        workerStatus,
    };
}

function parseQueuedVectorBackfillJob(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    const jobId = boundedText(record.jobId, 200);
    const state = boundedText(record.state, 40);
    return jobId && state ? { jobId, state } : null;
}

export default function MemoryDetailPage() {
    const params = useParams();
    const memoryId = String(params?.memoryId || '');
    const [meta, setMeta] = useState<any>(null);
    const [metaView, setMetaView] = useState<{
        memoryId: string;
        status: 'loading' | 'ready' | 'error';
        message?: string;
    }>();
    const [vectorBackfillView, setVectorBackfillView] = useState<VectorBackfillView>();
    const [submittingVectorBackfill, setSubmittingVectorBackfill] = useState(false);
    const [vectorBackfillPollAttempt, setVectorBackfillPollAttempt] = useState(0);
    const [items, setItems] = useState<any[]>([]);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const [total, setTotal] = useState(0);
    const [draftQuery, setDraftQuery] = useState('');
    const [submittedQuery, setSubmittedQuery] = useState<string | null>(null);
    const [submittedSearch, setSubmittedSearch] = useState<SubmittedMemorySearchSettings>();
    const t = useTranslations('Dashboard.Memories');
    // 新增状态
    const [searchConfig, setSearchConfig] =
        useState<Partial<HybridSearchConfig>>(DEFAULT_HYBRID_CONFIG);
    const [similarityThreshold, setSimilarityThreshold] = useState(0.3);
    const [maxResults, setMaxResults] = useState(50);
    const [showScores, setShowScores] = useState(true);
    const searchRequestRef = useRef(0);
    const metaRequestRef = useRef(0);
    const vectorBackfillRequestRef = useRef(0);
    const [queryView, setQueryView] = useState<MemoryQueryViewState>();
    const [searchStats, setSearchStats] = useState<{
        searchTime?: number;
        totalFound?: number;
        mode?: string;
        degraded?: boolean;
        unavailableLegs?: string[];
    }>({});

    const draftSearchConfigKey = useMemo(() => JSON.stringify(searchConfig), [searchConfig]);
    const submittedQueryValue = submittedQuery ?? '';
    const submittedSearchConfig = submittedSearch?.config;
    const queryRequest = useMemo<MemoryQueryRequest>(
        () => ({
            memoryId,
            mode: submittedQueryValue ? 'search' : 'browse',
            query: submittedQueryValue,
            page,
            pageSize,
            searchConfigKey: submittedSearch?.configKey ?? 'browse',
            similarityThreshold: submittedSearch?.similarityThreshold ?? 0,
            maxResults: submittedSearch?.maxResults ?? 50,
            refreshVersion: submittedSearch?.refreshVersion ?? 0,
        }),
        [memoryId, page, pageSize, submittedQueryValue, submittedSearch]
    );
    const resolvedQueryView = resolveMemoryQueryView(queryView, queryRequest);
    const isCurrentQueryView = isMemoryQueryViewCurrent(queryView, queryRequest);
    const loading = resolvedQueryView.status === 'loading';
    const isSearchMode = queryRequest.mode === 'search';
    const hasPendingSearchChanges =
        submittedQuery === null
            ? Boolean(draftQuery.trim())
            : draftQuery.trim() !== submittedQuery ||
              (Boolean(submittedQuery) &&
                  (!submittedSearch ||
                      draftSearchConfigKey !== submittedSearch.configKey ||
                      similarityThreshold !== submittedSearch.similarityThreshold ||
                      maxResults !== submittedSearch.maxResults));
    const searchSubmissionHint =
        submittedQuery === null
            ? draftQuery.trim()
                ? t('searchDraftPending')
                : t('searchReady')
            : submittedQuery === ''
              ? hasPendingSearchChanges
                  ? t('searchDraftPending')
                  : t('emptyQuerySubmitted')
              : hasPendingSearchChanges
                ? t('searchDraftPending')
                : null;
    const searchError = resolvedQueryView.status === 'error' ? resolvedQueryView.message : null;
    const visibleItems = isCurrentQueryView ? items : [];
    const visibleTotal = isCurrentQueryView ? total : 0;
    const visibleSearchStats: typeof searchStats = isCurrentQueryView ? searchStats : {};
    const visibleMeta = metaView?.memoryId === memoryId ? meta : null;
    const metaError =
        metaView?.memoryId === memoryId && metaView.status === 'error' ? metaView.message : null;
    const currentVectorBackfill =
        vectorBackfillView?.memoryId === memoryId ? vectorBackfillView : undefined;
    const vectorBackfillData = currentVectorBackfill?.data;
    const vectorBackfillPending = Boolean(
        vectorBackfillData && isMemoryVectorBackfillPendingState(vectorBackfillData.state)
    );
    const vectorBackfillPollingPaused =
        vectorBackfillPending && vectorBackfillPollAttempt >= VECTOR_BACKFILL_POLL_LIMIT;

    const getSearchModeLabel = (mode?: string) => {
        if (mode === 'vector') return t('SearchResult.vector');
        if (mode === 'keyword') return t('SearchResult.keyword');
        return t('SearchResult.hybrid');
    };

    const getUnavailableLegLabel = (leg: string) => {
        if (leg === 'vector') return t('SearchResult.vector');
        if (leg === 'keyword') return t('SearchResult.keyword');
        return leg;
    };

    const totalPages = useMemo(
        () => Math.max(1, Math.ceil((visibleTotal || 0) / pageSize)),
        [visibleTotal, pageSize]
    );

    const fetchVectorBackfillStatus = useCallback(async () => {
        const response = await fetch(`/api/memories/${encodeURIComponent(memoryId)}/vectors`, {
            cache: 'no-store',
            credentials: 'same-origin',
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || payload?.success !== true) {
            throw new Error('VECTOR_BACKFILL_STATUS_UNAVAILABLE');
        }
        const data = parseVectorBackfillStatus(payload.data);
        if (!data) throw new Error('INVALID_VECTOR_BACKFILL_STATUS');
        return data;
    }, [memoryId]);

    const refreshVectorBackfillStatus = useCallback(
        async (showLoading = false) => {
            const requestId = ++vectorBackfillRequestRef.current;
            if (showLoading) {
                setVectorBackfillView(current =>
                    current?.memoryId === memoryId
                        ? { ...current, status: 'loading', notice: undefined }
                        : { memoryId, status: 'loading' }
                );
            }

            try {
                const data = await fetchVectorBackfillStatus();
                if (requestId !== vectorBackfillRequestRef.current) return null;
                setVectorBackfillView({ memoryId, status: 'ready', data });
                return data;
            } catch {
                if (requestId !== vectorBackfillRequestRef.current) return null;
                setVectorBackfillView(current => {
                    if (current?.memoryId === memoryId && current.data) {
                        // Retain a just-submitted job reference so the action
                        // remains disabled until its authoritative status can
                        // be read again; never invite a duplicate click here.
                        return { ...current, status: 'ready', notice: 'status-unavailable' };
                    }
                    return { memoryId, status: 'error' };
                });
                return null;
            }
        },
        [fetchVectorBackfillStatus, memoryId]
    );

    const retryVectorBackfillStatus = () => {
        setVectorBackfillPollAttempt(0);
        void refreshVectorBackfillStatus(true);
    };

    const handleVectorBackfill = async () => {
        if (!vectorBackfillData || submittingVectorBackfill || vectorBackfillPending) return;

        setSubmittingVectorBackfill(true);
        setVectorBackfillView(current =>
            current?.memoryId === memoryId ? { ...current, notice: undefined } : current
        );
        try {
            const response = await fetch(`/api/memories/${encodeURIComponent(memoryId)}/vectors`, {
                method: 'POST',
                cache: 'no-store',
                credentials: 'same-origin',
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok || payload?.success !== true) {
                throw new Error('VECTOR_BACKFILL_REQUEST_FAILED');
            }
            const queuedJob = parseQueuedVectorBackfillJob(payload.data);
            if (!queuedJob) throw new Error('INVALID_VECTOR_BACKFILL_JOB');

            setVectorBackfillView(current => {
                if (current?.memoryId !== memoryId || !current.data) return current;
                return {
                    ...current,
                    status: 'ready',
                    data: { ...current.data, ...queuedJob },
                    notice: undefined,
                };
            });
            setVectorBackfillPollAttempt(0);
            toast.success(t('VectorIndex.queued'));
            await refreshVectorBackfillStatus(false);
        } catch {
            setVectorBackfillView(current => {
                if (current?.memoryId === memoryId && current.data) {
                    return { ...current, status: 'ready', notice: 'request-failed' };
                }
                return { memoryId, status: 'error' };
            });
            toast.error(t('VectorIndex.requestFailed'));
        } finally {
            setSubmittingVectorBackfill(false);
        }
    };

    // 手动搜索函数
    const handleSearch = (nextQuery = draftQuery) => {
        const config = snapshotMemorySearchConfig(searchConfig);
        setPage(1);
        setSubmittedQuery(nextQuery.trim());
        setSubmittedSearch(previous => ({
            config,
            configKey: JSON.stringify(config),
            similarityThreshold,
            maxResults,
            refreshVersion: (previous?.refreshVersion ?? 0) + 1,
        }));
    };

    // 清空搜索
    const handleClearSearch = () => {
        setDraftQuery('');
        handleSearch('');
    };

    useEffect(() => {
        const requestId = ++metaRequestRef.current;
        setMeta(null);
        setMetaView({ memoryId, status: 'loading' });

        void (async () => {
            try {
                const res = await getMemoryByIdAction(memoryId);
                if (requestId !== metaRequestRef.current) return;
                if (!res.success) throw new Error('memory metadata unavailable');
                setMeta(res.data);
                setMetaView({ memoryId, status: 'ready' });
            } catch {
                if (requestId !== metaRequestRef.current) return;
                setMeta(null);
                setMetaView({
                    memoryId,
                    status: 'error',
                    message: '加载记忆库信息失败，请返回列表确认后重试。',
                });
            }
        })();

        return () => {
            metaRequestRef.current += 1;
        };
    }, [memoryId]);

    useEffect(() => {
        setSubmittingVectorBackfill(false);
        setVectorBackfillPollAttempt(0);
        void refreshVectorBackfillStatus(true);

        return () => {
            vectorBackfillRequestRef.current += 1;
        };
    }, [memoryId, refreshVectorBackfillStatus]);

    useEffect(() => {
        if (!vectorBackfillPending || vectorBackfillPollingPaused) return;
        let cancelled = false;
        const timer = window.setTimeout(() => {
            void (async () => {
                await refreshVectorBackfillStatus(false);
                if (!cancelled) {
                    setVectorBackfillPollAttempt(attempt =>
                        Math.min(VECTOR_BACKFILL_POLL_LIMIT, attempt + 1)
                    );
                }
            })();
        }, VECTOR_BACKFILL_POLL_INTERVAL_MS);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [
        refreshVectorBackfillStatus,
        vectorBackfillPending,
        vectorBackfillPollingPaused,
        vectorBackfillPollAttempt,
    ]);

    useEffect(() => {
        const request = queryRequest;
        const timer = setTimeout(
            () => {
                void (async () => {
                    const requestId = ++searchRequestRef.current;
                    setQueryView(loadingMemoryQueryView(request));
                    setItems([]);
                    setTotal(0);
                    setSearchStats({});
                    const startTime = performance.now();

                    try {
                        if (request.mode === 'search') {
                            const res = await searchMemoryInLibraryAction(
                                request.memoryId,
                                request.query,
                                request.maxResults,
                                submittedSearchConfig
                            );
                            if (!res.success) throw new Error(res.error);
                            if (requestId !== searchRequestRef.current) return;

                            const filteredItems = (res.data || []).filter((item: any) =>
                                meetsMemorySearchRelevanceThreshold(
                                    item,
                                    request.similarityThreshold
                                )
                            );
                            setItems(filteredItems);
                            setTotal(filteredItems.length);
                            setSearchStats({
                                searchTime: performance.now() - startTime,
                                totalFound: (res.data || []).length,
                                mode:
                                    res.effectiveMode ||
                                    res.mode ||
                                    submittedSearchConfig?.mode ||
                                    'hybrid',
                                degraded: Boolean(res.degraded),
                                unavailableLegs: res.unavailableLegs || [],
                            });
                        } else {
                            const res = await getMemoryEntriesPagedAction(
                                request.memoryId,
                                request.page,
                                request.pageSize
                            );
                            if (!res.success) throw new Error(res.error);
                            if (requestId !== searchRequestRef.current) return;
                            setItems(res.data || []);
                            setTotal(res.total || 0);
                            setSearchStats({});
                        }

                        setQueryView(readyMemoryQueryView(request));
                    } catch (error) {
                        if (requestId !== searchRequestRef.current) return;
                        const message =
                            request.mode === 'search'
                                ? memorySearchPublicErrorMessage(error)
                                : '加载记忆库内容失败，请稍后重试。';
                        setItems([]);
                        setTotal(0);
                        setSearchStats({});
                        setQueryView(failedMemoryQueryView(request, message));
                        toast.error(message);
                    }
                })();
            },
            request.mode === 'search' ? 500 : 0
        );

        return () => {
            clearTimeout(timer);
            searchRequestRef.current += 1;
        };
    }, [queryRequest, submittedSearchConfig]);

    const vectorCoverage = vectorBackfillData?.coverage;
    const vectorNeedsBackfill = Boolean(
        vectorCoverage && vectorCoverage.total > 0 && vectorCoverage.remaining > 0
    );
    const vectorWorkerProblem =
        vectorBackfillData && (vectorBackfillPending || vectorNeedsBackfill)
            ? isMemoryVectorBackfillWorkerProblem(vectorBackfillData.workerStatus)
            : null;
    const canStartVectorBackfill = Boolean(
        currentVectorBackfill?.status === 'ready' &&
        vectorNeedsBackfill &&
        !vectorBackfillPending &&
        !submittingVectorBackfill
    );
    const showVectorBackfillAction = Boolean(
        currentVectorBackfill?.status === 'ready' && vectorNeedsBackfill && !vectorBackfillPending
    );
    const vectorBackfillMessage = (() => {
        if (!currentVectorBackfill || currentVectorBackfill.status === 'loading') {
            return t('VectorIndex.loading');
        }
        if (currentVectorBackfill?.status === 'error' || !vectorBackfillData) {
            return t('VectorIndex.unavailable');
        }
        if (submittingVectorBackfill) return t('VectorIndex.starting');
        if (vectorBackfillData.state === 'failed') return t('VectorIndex.failed');
        if (vectorBackfillPending) {
            return vectorBackfillData.state === 'active'
                ? t('VectorIndex.running')
                : t('VectorIndex.queued');
        }
        if (vectorCoverage?.total === 0) return t('VectorIndex.empty');
        if (vectorCoverage?.remaining === 0) return t('VectorIndex.complete');
        if (vectorBackfillData.state === 'completed') {
            return t('VectorIndex.completedWithRemaining', {
                remaining: vectorCoverage?.remaining || 0,
            });
        }
        return t('VectorIndex.needsBackfill', { remaining: vectorCoverage?.remaining || 0 });
    })();

    return (
        <div className="space-y-6 p-4">
            {/* 页面头部 */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-medium">{t('memoryDetails')}</h1>
                    <div className="mt-1 flex items-center gap-2">
                        <p className="text-sm text-muted-foreground">
                            {visibleMeta?.name || memoryId}
                        </p>
                        {isSearchMode && visibleSearchStats.totalFound !== undefined && (
                            <Badge variant="secondary">
                                找到 {visibleSearchStats.totalFound} 条，显示 {visibleTotal} 条
                            </Badge>
                        )}
                        {!isSearchMode && <Badge variant="outline">共 {visibleTotal} 条记录</Badge>}
                    </div>
                    {metaError && (
                        <p className="mt-1 text-xs text-destructive" role="alert">
                            {metaError}
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <Button asChild variant="outline">
                        <a href="/dashboard/memories">{t('back')}</a>
                    </Button>
                </div>
            </div>

            <Separator />

            <Card className="border-dashed bg-muted/20 p-4">
                <div aria-atomic="true" aria-live="polite" className="space-y-3" role="status">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                            <div className="mt-0.5 rounded-md border bg-background p-2 text-muted-foreground">
                                {!currentVectorBackfill ||
                                currentVectorBackfill.status === 'loading' ||
                                submittingVectorBackfill ||
                                vectorBackfillPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                ) : currentVectorBackfill.status === 'error' ||
                                  vectorBackfillData?.state === 'failed' ? (
                                    <AlertTriangle
                                        className="h-4 w-4 text-amber-600"
                                        aria-hidden="true"
                                    />
                                ) : vectorCoverage && vectorCoverage.remaining === 0 ? (
                                    <CheckCircle2
                                        className="h-4 w-4 text-emerald-600"
                                        aria-hidden="true"
                                    />
                                ) : (
                                    <Database className="h-4 w-4" aria-hidden="true" />
                                )}
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-sm font-medium">{t('VectorIndex.title')}</h2>
                                <p className="mt-0.5 text-sm text-muted-foreground">
                                    {vectorBackfillMessage}
                                </p>
                            </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                            {showVectorBackfillAction && (
                                <Button
                                    size="sm"
                                    onClick={handleVectorBackfill}
                                    disabled={!canStartVectorBackfill}
                                >
                                    {submittingVectorBackfill ? (
                                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Database className="mr-1.5 h-3.5 w-3.5" />
                                    )}
                                    {submittingVectorBackfill
                                        ? t('VectorIndex.starting')
                                        : t('VectorIndex.start')}
                                </Button>
                            )}
                            {(currentVectorBackfill?.status === 'error' ||
                                vectorBackfillPollingPaused) && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={retryVectorBackfillStatus}
                                >
                                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                                    {t('VectorIndex.refreshStatus')}
                                </Button>
                            )}
                        </div>
                    </div>

                    {vectorCoverage && vectorCoverage.total > 0 && (
                        <div className="rounded-md border bg-background/70 px-3 py-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                <span>
                                    {t('VectorIndex.coverage', {
                                        indexed: vectorCoverage.indexed,
                                        total: vectorCoverage.total,
                                        remaining: vectorCoverage.remaining,
                                    })}
                                </span>
                                <span>
                                    {Math.round(
                                        (vectorCoverage.indexed / vectorCoverage.total) * 100
                                    )}
                                    %
                                </span>
                            </div>
                            <div
                                aria-label={t('VectorIndex.coverage', {
                                    indexed: vectorCoverage.indexed,
                                    total: vectorCoverage.total,
                                    remaining: vectorCoverage.remaining,
                                })}
                                aria-valuemax={100}
                                aria-valuemin={0}
                                aria-valuenow={Math.round(
                                    (vectorCoverage.indexed / vectorCoverage.total) * 100
                                )}
                                className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                                role="progressbar"
                            >
                                <div
                                    className="h-full rounded-full bg-primary transition-all duration-300"
                                    style={{
                                        width: `${Math.round(
                                            (vectorCoverage.indexed / vectorCoverage.total) * 100
                                        )}%`,
                                    }}
                                />
                            </div>
                        </div>
                    )}

                    {vectorBackfillPending && vectorBackfillData?.progress && (
                        <p className="text-xs text-muted-foreground">
                            {vectorBackfillData.progress.currentBatch !== null &&
                            vectorBackfillData.progress.totalBatches !== null &&
                            vectorBackfillData.progress.totalBatches > 0
                                ? t('VectorIndex.progressBatches', {
                                      current: vectorBackfillData.progress.currentBatch,
                                      total: vectorBackfillData.progress.totalBatches,
                                      progress: Math.round(vectorBackfillData.progress.progress),
                                  })
                                : t('VectorIndex.progressPercent', {
                                      progress: Math.round(vectorBackfillData.progress.progress),
                                  })}
                        </p>
                    )}

                    {vectorWorkerProblem && (
                        <p className="flex items-start gap-2 text-xs leading-5 text-amber-700">
                            <AlertTriangle
                                className="mt-0.5 h-3.5 w-3.5 shrink-0"
                                aria-hidden="true"
                            />
                            {t(
                                vectorWorkerProblem === 'stale'
                                    ? 'VectorIndex.workerStale'
                                    : 'VectorIndex.workerUnavailable'
                            )}
                        </p>
                    )}

                    {vectorBackfillPollingPaused && (
                        <p className="text-xs text-muted-foreground" role="alert">
                            {t('VectorIndex.pollingPaused')}
                        </p>
                    )}

                    {currentVectorBackfill?.notice && (
                        <p className="text-xs text-amber-700" role="alert">
                            {t(
                                currentVectorBackfill.notice === 'request-failed'
                                    ? 'VectorIndex.requestFailed'
                                    : 'VectorIndex.statusUnavailable'
                            )}
                        </p>
                    )}
                </div>
            </Card>

            {/* 搜索区域 */}
            <Card className="space-y-4 p-4">
                <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
                        <Input
                            placeholder={t('searchPlaceholder1')}
                            value={draftQuery}
                            onChange={e => setDraftQuery(e.target.value)}
                            className="pl-10"
                            onKeyDown={e => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleSearch();
                                }
                            }}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            onClick={() => handleSearch()}
                            disabled={loading}
                            className="flex items-center gap-2"
                        >
                            {loading ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                                <Search className="h-4 w-4" />
                            )}
                            {t('search')}
                        </Button>
                        {(draftQuery || submittedQuery) && (
                            <Button variant="outline" onClick={handleClearSearch}>
                                {t('clean')}
                            </Button>
                        )}
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setShowScores(!showScores)}
                            title={showScores ? '隐藏相似度' : '显示相似度'}
                        >
                            {showScores ? (
                                <EyeOff className="h-4 w-4" />
                            ) : (
                                <Eye className="h-4 w-4" />
                            )}
                        </Button>
                    </div>
                </div>
                {searchSubmissionHint && (
                    <p className="text-xs text-muted-foreground" role="status">
                        {searchSubmissionHint}
                    </p>
                )}

                {/* 搜索统计信息 */}
                {isSearchMode && visibleSearchStats.searchTime !== undefined && (
                    <Alert>
                        <Search className="h-4 w-4" />
                        <AlertDescription>
                            <div className="flex items-center gap-4 text-sm">
                                <span>
                                    执行模式:{' '}
                                    <Badge variant="secondary">
                                        {getSearchModeLabel(visibleSearchStats.mode)}
                                    </Badge>
                                </span>
                                <span>用时: {Math.round(visibleSearchStats.searchTime)}ms</span>
                                <span>
                                    阈值: {(queryRequest.similarityThreshold * 100).toFixed(0)}%
                                </span>
                                {visibleSearchStats.totalFound !== visibleTotal && (
                                    <span className="text-amber-600">
                                        已过滤 {(visibleSearchStats.totalFound || 0) - visibleTotal}{' '}
                                        条低相关性结果
                                    </span>
                                )}
                                {visibleSearchStats.degraded && (
                                    <span className="text-amber-600">
                                        {t('degradedSearch', {
                                            mode: getSearchModeLabel(visibleSearchStats.mode),
                                        })}
                                    </span>
                                )}
                                {visibleSearchStats.unavailableLegs?.length ? (
                                    <span className="text-amber-600">
                                        不可用：
                                        {visibleSearchStats.unavailableLegs
                                            .map(getUnavailableLegLabel)
                                            .join('、')}
                                    </span>
                                ) : null}
                            </div>
                        </AlertDescription>
                    </Alert>
                )}
            </Card>

            {/* 搜索配置面板 */}
            <SearchConfigPanel
                config={searchConfig}
                onConfigChange={setSearchConfig}
                similarityThreshold={similarityThreshold}
                onSimilarityThresholdChange={setSimilarityThreshold}
                maxResults={maxResults}
                onMaxResultsChange={setMaxResults}
            />

            {/* 搜索结果 */}
            <div className="space-y-4">
                {loading ? (
                    <Card className="p-8">
                        <div className="flex items-center justify-center">
                            <RefreshCw className="mr-2 h-6 w-6 animate-spin" />
                            <span>{isSearchMode ? '搜索中...' : '正在加载记忆库内容...'}</span>
                        </div>
                    </Card>
                ) : searchError ? (
                    <Card className="border-destructive/40 p-8" role="alert">
                        <div className="text-center">
                            <p className="font-medium text-destructive">{searchError}</p>
                            <p className="mt-2 text-sm text-muted-foreground">
                                {isSearchMode
                                    ? '本次检索未完成，未将其视为“未找到结果”。请稍后重试。'
                                    : '本次加载未完成，未将其视为“暂无数据”。请稍后重试。'}
                            </p>
                        </div>
                    </Card>
                ) : visibleItems.length === 0 ? (
                    <Card className="p-8">
                        <div className="text-center text-muted-foreground">
                            {isSearchMode && (visibleSearchStats.totalFound || 0) > 0
                                ? `已检索到 ${visibleSearchStats.totalFound} 条结果，但都低于当前相似度阈值。请降低阈值后重试。`
                                : isSearchMode
                                  ? '未找到匹配的结果'
                                  : submittedQuery === ''
                                    ? t('emptyQuerySubmitted')
                                    : '暂无数据'}
                        </div>
                    </Card>
                ) : (
                    <>
                        {/* 搜索结果列表 */}
                        <div className="space-y-3">
                            {visibleItems.map((item, index) => (
                                <SearchResultItem
                                    key={item.id}
                                    item={item}
                                    index={index}
                                    searchQuery={submittedQueryValue}
                                    showScores={showScores && isSearchMode}
                                />
                            ))}
                        </div>

                        {/* 分页控制 */}
                        {!isSearchMode && totalPages > 1 && (
                            <Card className="p-3">
                                <div className="flex items-center justify-between">
                                    <div className="text-sm text-muted-foreground">
                                        第 {page} / {totalPages} 页 · 共 {visibleTotal} 条记录
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={page <= 1}
                                            onClick={() => setPage(p => Math.max(1, p - 1))}
                                        >
                                            上一页
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={page >= totalPages}
                                            onClick={() =>
                                                setPage(p => Math.min(totalPages, p + 1))
                                            }
                                        >
                                            下一页
                                        </Button>
                                    </div>
                                </div>
                            </Card>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
