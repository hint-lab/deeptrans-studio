'use client';
import { applySegmentAction, getLatestDocumentStatusForProjectAction, updateDocumentStatusByIdAction, type PreviewSegmentItem } from '@/actions/document';
import { Button } from '@/components/ui/button';
import { useProjectInit } from '@/hooks/useProjectInit';
import { createLogger } from '@/lib/logger';
import {
    Coffee,
    Loader,
    Loader2,
    Redo2,
    Square,
    SquareCheckBig
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import ParsePanel from './components/ParsePanel';
import SegmentPanel from './components/SegmentPanel';
import Stepper from './components/Stepper';
import TermsPanel from './components/TermsPanel';
const logger = createLogger({
    type: 'client:project-init-page',
}, {
    json: false,// 开启json格式输出
    pretty: false, // 关闭开发环境美化输出
    colors: true, // 仅当json：false时启用颜色输出可用
    includeCaller: false, // 日志不包含调用者
});
export default function ProjectInitPage() {
    const t = useTranslations('Dashboard.Init');
    const { id } = useParams<{ id: string }>();
    const projectId = String(id || '');
    const router = useRouter();
    const { entry, restart, updateBatchId, updateStep, updateProgress } = useProjectInit(projectId);
    const batchId = entry?.batchId || '';
    logger.info('ProjectInitPage render projectId, batchId', `${projectId}, ${batchId}`)
    const segPct = entry?.segPct || 0;
    const termPct = entry?.termPct || 0;
    const segPctRef = useRef(0);
    const termPctRef = useRef(0);
    const [phase, setPhase] = useState<'INIT' | 'RUNNING' | 'DONE' | 'ERROR'>('INIT');
    const currentStep: 'parse' | 'segment' | 'terms' | 'done' = entry?.currentStep || 'parse';
    const [starting, setStarting] = useState(false);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const statusAbortRef = useRef<AbortController | null>(null);
    const [preview, setPreview] = useState<string>('');
    const [terms, setTerms] = useState<Array<{ term: string; count: number; score?: number }>>([]);
    const [previewHtml, setPreviewHtml] = useState<string>('');
    // 横向步骤视图无需折叠面板

    const overall = Math.round((segPct + termPct) / 2);

    useEffect(() => {
        /* 由 useProjectInit.ensure 初始化 batchId；此处不再本地生成 */
    }, [projectId]);

    async function runParse() {
        if (!projectId) return;
        setStarting(true);
        try {
            const u = new URL(`/api/projects/${projectId}/parse`, window.location.origin);
            u.searchParams.set('batchId', batchId);
            const r = await fetch(u.toString(), { method: 'POST' });
            if (!r.ok) throw new Error('parse failed');
            // 解析完成后，取一次状态以获取预览，停留等待用户确认
            const u2 = new URL(`/api/projects/${projectId}/init`, window.location.origin);
            u2.searchParams.set('batchId', batchId);
            u2.searchParams.set('wait', '3000');
            const s = await fetch(u2.toString());
            if (s.ok) {
                const j = await s.json();
                if (typeof j?.preview === 'string') setPreview(j.preview);
                if (typeof j?.previewHtml === 'string') setPreviewHtml(j.previewHtml);
            }
            updateStep('parse');
        } catch {
            setPhase('ERROR');
        } finally {
            setStarting(false);
        }
    }

    // 预览兜底：没有服务端 HTML 时，用纯文本拼简易 HTML
    useEffect(() => { }, [preview, previewHtml]);

    async function startSegment() {
        if (!projectId) return;
        setStarting(true);
        try {
            const u = new URL(`/api/projects/${projectId}/segment`, window.location.origin);
            u.searchParams.set('batchId', batchId);
            //logger.info('startSegment: ', u.toString())
            const r = await fetch(u.toString(), { method: 'POST' });
            if (!r.ok) throw new Error('segment failed');
            // 状态由全局轮询同步
        } catch {
            setPhase('ERROR');
        } finally {
            setStarting(false);
        }
    }

    const [maxTerms, setMaxTerms] = useState<number>(120);
    const [chunkSize, setChunkSize] = useState<number>(8000);
    const [overlap, setOverlap] = useState<number>(300);
    const [termPrompt, setTermPrompt] = useState<string>('');
    const [termPreview, setTermPreview] = useState<Array<{ term: string; score?: number }>>([]);
    const [dictMatches, setDictMatches] = useState<
        Array<{ term: string; translation: string; notes?: string; source?: string }>
    >([]);
    const [autoApplyTerms, setAutoApplyTerms] = useState<boolean>(true);
    const [termPreviewLoading, setTermPreviewLoading] = useState(false);
    const [applyingTerms, setApplyingTerms] = useState(false);
    const [termsApplied, setTermsApplied] = useState(false);

    // segment 预览交互（与 segment-preview 页面对齐）
    const [segItems, setSegItems] = useState<PreviewSegmentItem[]>([]);
    const [segLoading, setSegLoading] = useState(false);
    const [segError, setSegError] = useState<string | null>(null);
    const [segmentDocumentId, setSegmentDocumentId] = useState<string>('');
    const segDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [applying, setApplying] = useState(false);
    const [showApplyModal, setShowApplyModal] = useState(false);
    const [cancelApplyRequested, setCancelApplyRequested] = useState(false);
    const applyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // 术语提取的应用模态（与分段类似的体验）
    const [termApplying, setTermApplying] = useState(false);
    const [showTermApplyModal, setShowTermApplyModal] = useState(false);
    const [cancelTermApplyRequested, setCancelTermApplyRequested] = useState(false);
    const termApplyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // 三阶段术语流程（提取 -> 插入已有词条 -> 预翻译未知词条）
    const [termFlow, setTermFlow] = useState<
        'idle' | 'extracting' | 'applying' | 'translating' | 'done'
    >('idle');
    const [applyStatsInsert, setApplyStatsInsert] = useState<{
        inserted: number;
        updated: number;
        skipped: number;
    } | null>(null);
    const [applyStatsTranslate, setApplyStatsTranslate] = useState<{
        inserted: number;
        updated: number;
        skipped: number;
    } | null>(null);
    const [translateCount, setTranslateCount] = useState<number | null>(null);

    async function startTerms() {
        if (!projectId) return;
        setStarting(true);
        try {
            const r = await fetch(`/api/projects/${projectId}/terms`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    batchId,
                    terms: { maxTerms, chunkSize, overlap, prompt: termPrompt },
                }),
            });
            if (!r.ok) throw new Error('terms failed');
            // 状态由全局轮询同步
        } catch {
            setPhase('ERROR');
        } finally {
            setStarting(false);
        }
    }

    // 单次调用：仅插入或插入+预翻译（二选一）
    async function applyTermsOnce(flagAutoTranslate: boolean) {
        const r = await fetch(`/api/projects/${projectId}/terms/apply`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ batchId, mode: 'upsert', autoTranslate: flagAutoTranslate }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || 'apply terms failed');
        const inserted = Number(j?.inserted || 0);
        const updated = Number(j?.updated || 0);
        const skipped = Number(j?.skipped || 0);
        return { inserted, updated, skipped };
    }

    // 二阶段应用：先插入，再（可选）预翻译
    async function applyTermsPipeline() {
        if (!projectId || !batchId) return false;
        setApplyingTerms(true);
        await updateDocumentStatusByIdAction(segmentDocumentId, 'TERMS_EXTRACTING');
        try {
            setTermFlow('applying');
            const s1 = await applyTermsOnce(false);
            setApplyStatsInsert(s1);
            if (autoApplyTerms) {
                setTermFlow('translating');
                const s2 = await applyTermsOnce(true);
                setApplyStatsTranslate(s2);
                const delta = Math.max(0, Number(s2?.updated || 0) - Number(s1?.updated || 0));
                setTranslateCount(delta);
            }
            setTermsApplied(true);
            setTermFlow('done');
            toast.success('术语已写入项目词库');
            return true;
        } catch (e: any) {
            toast.error('写入项目词库失败', { description: e?.message || 'apply terms failed' });
            return false;
        } finally {
            setApplyingTerms(false);
        }
    }
    async function loadTermPreview() {
        if (!projectId || !batchId) return;
        setTermPreviewLoading(true);
        try {
            const r = await fetch(`/api/projects/${projectId}/terms/preview`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ batchId, maxTerms, prompt: termPrompt }),
            });
            const j = await r.json();
            if (Array.isArray(j?.terms)) setTermPreview(j.terms);
        } catch {
        } finally {
            setTermPreviewLoading(false);
        }
    }

    // 提取 Button 内联的“应用到文档”逻辑为独立函数
    function handleApplySegmentsClick() {
        if (!segmentDocumentId || !segItems.length) return;
        // 打开模态并延迟启动，允许用户在极短时间内取消
        setShowApplyModal(true);
        setCancelApplyRequested(false);

        if (applyTimerRef.current) clearTimeout(applyTimerRef.current);
        applyTimerRef.current = setTimeout(async () => {
            if (cancelApplyRequested) return;
            try {
                setApplying(true);
                // 1) 触发全量分割（非预览），在服务端按 JSON paragraphs 生成完整段落
                try {
                    const uPost = new URL(
                        `/api/projects/${projectId}/segment`,
                        window.location.origin
                    );
                    uPost.searchParams.set('batchId', batchId);
                    await fetch(uPost.toString(), { method: 'POST' });
                } catch { }
                // 2) 拉取全量段落，失败则回退到预览段落
                let fullSegs: any[] = [];
                try {
                    for (let i = 0; i < 4; i++) {
                        const u = new URL(
                            `/api/projects/${projectId}/segment`,
                            window.location.origin
                        );
                        u.searchParams.set('batchId', batchId);
                        u.searchParams.set('wait', '2000');
                        const r = await fetch(u.toString());
                        const j = await r.json();
                        const segs = Array.isArray(j?.segments) ? j.segments : [];
                        if (segs.length) {
                            fullSegs = segs;
                            break;
                        }
                    }
                } catch { }
                const toApply = fullSegs.length ? fullSegs : segItems;
                const res = await applySegmentAction(segmentDocumentId, toApply);
                if ((res as any)?.count >= 0) {
                    updateProgress(100, undefined);
                    segPctRef.current = 100;
                    updateStep('terms');
                }
            } catch {
            } finally {
                setApplying(false);
                setShowApplyModal(false);
            }
        }, 500);
    }

    useEffect(() => {
        if (projectId && batchId) runParse();
        // 取消旧的定时轮询
        if (statusPollRef.current) {
            clearInterval(statusPollRef.current);
            statusPollRef.current = null;
        }

        let stopped = false;
        const longPoll = async (prevSeg: number, prevTerms: number) => {
            if (!projectId || !batchId || stopped) return;
            // 中止上一轮
            if (statusAbortRef.current) {
                try {
                    statusAbortRef.current.abort();
                } catch { }
            }
            const controller = new AbortController();
            statusAbortRef.current = controller;
            try {
                const url = `/api/projects/${projectId}/init?batchId=${encodeURIComponent(batchId)}&wait=30000&lastSeg=${prevSeg}&lastTerms=${prevTerms}`;
                //logger.info('/api/projects/projectId/init url: ', url)
                const s = await fetch(url, { signal: controller.signal });
                if (!s.ok) throw new Error('status failed');
                const j = await s.json();
                const a = Math.max(0, Math.min(100, Number(j?.segProgress || 0)));
                const b = Math.max(0, Math.min(100, Number(j?.termsProgress || 0)));
                const nextA = Math.max(a, segPctRef.current);
                const nextB = Math.max(b, termPctRef.current);
                segPctRef.current = nextA;
                termPctRef.current = nextB;
                updateProgress(nextA, nextB);
                if (Array.isArray(j?.terms)) setTerms(j.terms);
                if (Array.isArray(j?.dict)) setDictMatches(j.dict);
                if (typeof j?.previewHtml === 'string' && !previewHtml)
                    setPreviewHtml(j.previewHtml);
                if (!(a >= 100 && b >= 100)) {
                    longPoll(a, b);
                } else {
                    // 保持停留在术语步骤，避免术语未确认时提前进入完成页
                    updateStep('terms');
                }
            } catch (e: any) {
                if (controller.signal.aborted || stopped) return;
                setTimeout(() => longPoll(prevSeg, prevTerms), 6000);
            }
        };

        // 初次强制返回一次最新状态
        longPoll(-1, -1);

        return () => {
            stopped = true;
            if (pollRef.current) clearInterval(pollRef.current);
            if (statusPollRef.current) clearInterval(statusPollRef.current);
            if (statusAbortRef.current) {
                try {
                    statusAbortRef.current.abort();
                } catch { }
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId, batchId]);

    // 术语提取完成后，若处于流程中，则继续应用（不自动关闭模态）
    useEffect(() => {
        if (termPct >= 100 && showTermApplyModal && termFlow === 'extracting') {
            void applyTermsPipeline();
        }
    }, [termPct, showTermApplyModal, termFlow]);
    // 取消原有的自动写入逻辑，改由流程控制

    // 获取当前项目的最新文档，用于预览/应用
    useEffect(() => {
        (async () => {
            try {
                const s = await getLatestDocumentStatusForProjectAction(projectId);
                if (s && s.documentId) setSegmentDocumentId(s.documentId);
            } catch { }
        })();
    }, [projectId]);

    async function loadSegPreview(opts?: { all?: boolean }) {
        if (!projectId || !batchId) return;
        setSegLoading(true);
        setSegError(null);
        try {
            // 触发预览分段：使用 segment 模式 + preview/headChars
            const headChars = 2000;
            const uPost = new URL(`/api/projects/${projectId}/segment`, window.location.origin);
            uPost.searchParams.set('batchId', batchId);
            uPost.searchParams.set('preview', '1');
            uPost.searchParams.set('headChars', String(headChars));
            await fetch(uPost.toString(), { method: 'POST' });
            // 短轮询最多 3 次，等待 worker 返回
            let got: any[] = [];
            for (let i = 0; i < 3; i++) {
                const u = new URL(`/api/projects/${projectId}/segment`, window.location.origin);
                u.searchParams.set('batchId', batchId);
                u.searchParams.set('preview', '1');
                if (opts?.all) u.searchParams.set('all', '1');
                u.searchParams.set('wait', '3000');
                const r = await fetch(u.toString());
                const j = await r.json();
                const segs = Array.isArray(j?.segments) ? j.segments : [];
                if (segs.length) {
                    got = segs;
                    break;
                }
            }
            setSegItems(got);
        } catch (e: any) {
            setSegError(String(e?.message || e));
        } finally {
            setSegLoading(false);
        }
    }

    // 进入分割步骤时加载一次预览
    useEffect(() => {
        if (currentStep === 'segment' && segmentDocumentId) {
            loadSegPreview();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentStep, segmentDocumentId]);

    // 进入 terms 步骤时加载术语预览
    useEffect(() => {
        if (currentStep === 'terms' && projectId && batchId) {
            loadTermPreview();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentStep]);

    // 粒度/提示变更时自动刷新预览（防抖），仅在分割步骤生效
    useEffect(() => {
        if (currentStep !== 'segment' || !segmentDocumentId) return;
        if (segDebounceRef.current) clearTimeout(segDebounceRef.current);
        segDebounceRef.current = setTimeout(() => {
            loadSegPreview();
        }, 500);
        return () => {
            if (segDebounceRef.current) clearTimeout(segDebounceRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentStep, segmentDocumentId]);

    // 顶部步骤条使用统一 Stepper 组件

    return (
        <div className="px-6 py-6">
            <div className="mx-auto max-w-5xl">
                <div className="mb-5 rounded-xl border bg-white dark:bg-gray-900">
                    <div className="border-b px-5 py-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h1 className="text-base font-semibold">{t('title')}</h1>
                            </div>
                            {currentStep === 'done' && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                        const newId = `${projectId}.${Date.now()}`;
                                        updateProgress(0, 0);
                                        segPctRef.current = 0;
                                        termPctRef.current = 0;
                                        setTerms([]);
                                        setPreview('');
                                        setPreviewHtml('');
                                        setSegItems([]);
                                        setSegError(null);
                                        updateStep('parse');
                                        restart();
                                        updateBatchId(newId);
                                    }}
                                    disabled={starting}
                                    className="gap-1"
                                >
                                    {starting ? (
                                        <>
                                            <Loader className="h-4 w-4 animate-spin" />
                                            {t('processing')}
                                        </>
                                    ) : (
                                        <>
                                            <Redo2 className="h-4 w-4" />
                                            {t('restart')}
                                        </>
                                    )}
                                </Button>
                            )}
                        </div>
                        {/* 横向步骤条 */}
                        <Stepper
                            currentStep={currentStep}
                            segPct={segPct}
                            termPct={termPct}
                            onStepClick={s => {
                                // 仅允许回退：parse <- segment <- terms <- done
                                const order: Array<typeof currentStep> = [
                                    'parse',
                                    'segment',
                                    'terms',
                                    'done',
                                ];
                                const cur = order.indexOf(currentStep);
                                const tar = order.indexOf(s);
                                if (tar >= 0 && tar < cur) updateStep(s);
                            }}
                        />
                    </div>
                    <div className="space-y-6 px-5 py-6">
                        {/* 步骤结果区域 */}
                        {currentStep === 'parse' && <ParsePanel previewHtml={previewHtml} />}

                        {currentStep === 'segment' && (
                            <SegmentPanel
                                segItems={segItems}
                                segLoading={segLoading}
                                segError={segError}
                                onResegment={o => {
                                    if (segmentDocumentId) void loadSegPreview({ all: o?.all });
                                }}
                                busy={segLoading || starting}
                            />
                        )}

                        {currentStep === 'terms' && (
                            <TermsPanel
                                maxTerms={maxTerms}
                                setMaxTerms={setMaxTerms}
                                chunkSize={chunkSize}
                                setChunkSize={setChunkSize}
                                overlap={overlap}
                                setOverlap={setOverlap}
                                termPrompt={termPrompt}
                                setTermPrompt={setTermPrompt}
                                termPreview={termPreview}
                                termPreviewLoading={termPreviewLoading}
                                terms={terms}
                                dict={dictMatches}
                                autoApplyTerms={autoApplyTerms}
                                setAutoApplyTerms={setAutoApplyTerms}
                                termPct={termPct}
                                starting={starting}
                                onPreview={loadTermPreview}
                                onStart={startTerms}
                                onApply={async () => {
                                    await applyTermsPipeline();
                                }}
                                applying={applyingTerms}
                                onViewDictionary={() =>
                                    router.push(`/dashboard/dictionaries/${projectId}`)
                                }
                                onSkip={() => updateStep('done')}
                            />
                        )}

                        {currentStep === 'done' && (
                            <section className="space-y-2" id="step-done">
                                <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200">
                                    <div className="text-sm">🎉 {t('doneTip')}</div>
                                </div>
                            </section>
                        )}

                        {/* 底部操作区 */}
                        <div className="flex justify-end gap-2 pt-2">
                            {currentStep === 'parse' && (
                                <>
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            updateProgress(0, 0);
                                            runParse();
                                        }}
                                        disabled={starting}
                                    >
                                        {t('retryParse')}
                                    </Button>
                                    <Button
                                        onClick={() => {
                                            const u = new URL(
                                                `/api/projects/${projectId}/init`,
                                                window.location.origin
                                            );
                                            u.searchParams.set('action', 'persist');
                                            u.searchParams.set('batchId', batchId);
                                            void fetch(u.toString(), { method: 'POST' });
                                            updateStep('segment');
                                            updateDocumentStatusByIdAction(
                                                segmentDocumentId,
                                                'PARSING'
                                            );
                                        }}
                                        disabled={starting || !previewHtml}
                                    >
                                        {t('next')}
                                    </Button>
                                </>
                            )}
                            {currentStep === 'segment' && (
                                <>
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            if (segmentDocumentId) void loadSegPreview();
                                        }}
                                        disabled={segLoading || starting}
                                    >
                                        {t('resegment')}
                                    </Button>
                                    <Button
                                        onClick={handleApplySegmentsClick}
                                        disabled={!segItems.length || applying || starting}
                                    >
                                        {applying ? t('applying') : t('next')}
                                    </Button>
                                </>
                            )}
                            {currentStep === 'terms' && (
                                <>
                                    {termPct < 100 && (
                                        <Button
                                            onClick={() => {
                                                // 弹出模态，允许短时间取消
                                                setShowTermApplyModal(true);
                                                setCancelTermApplyRequested(false);
                                                setTermFlow('extracting');
                                                if (termApplyTimerRef.current)
                                                    clearTimeout(termApplyTimerRef.current);
                                                termApplyTimerRef.current = setTimeout(async () => {
                                                    if (cancelTermApplyRequested) return;
                                                    try {
                                                        setTermApplying(true);
                                                        await startTerms();
                                                    } catch { }
                                                }, 500);
                                            }}
                                            disabled={starting || (termPct > 0 && termPct < 100)}
                                        >
                                            {t('next')}
                                        </Button>
                                    )}
                                    {false && termPct >= 100 && (
                                        <Button
                                            variant="outline"
                                            onClick={() => {
                                                setShowTermApplyModal(true);
                                                setTermFlow('applying');
                                                void applyTermsPipeline();
                                            }}
                                            disabled={applyingTerms}
                                        >
                                            {applyingTerms ? '写入中…' : '手动写入词库'}
                                        </Button>
                                    )}
                                    {termPct >= 100 && (
                                        <Button onClick={() => updateStep('done')}>
                                            {t('next')}
                                        </Button>
                                    )}
                                </>
                            )}
                            {currentStep === 'done' && (
                                <>
                                    <Button
                                        onClick={() =>
                                            router.push(
                                                `/dashboard/dictionaries/project/${projectId}`
                                            )
                                        }
                                    >
                                        {t('gotoDict')}
                                    </Button>
                                    <Button onClick={() => router.push(`/ide/${projectId}`)}>
                                        {t('gotoIDE')}
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            {showApplyModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="w-[360px] rounded-lg bg-white p-6 text-center shadow-lg dark:bg-gray-900">
                        <div className="flex flex-col items-center gap-3">
                            <Coffee className="h-8 w-8 text-amber-600" />
                            <div className="text-sm font-medium">
                                {applying ? t('applyToFull') : t('prepareApply')}
                            </div>
                            <div className="text-xs text-muted-foreground">{t('applyNotice')}</div>
                            <div className="text-xs text-muted-foreground">
                                {t('segProgress', { pct: Math.max(0, Math.min(100, segPct)) })}
                            </div>
                            <div className="mt-2 flex gap-2">
                                {!applying ? (
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            setCancelApplyRequested(true);
                                            if (applyTimerRef.current)
                                                clearTimeout(applyTimerRef.current);
                                            setShowApplyModal(false);
                                        }}
                                    >
                                        {t('modalStop')}
                                    </Button>
                                ) : (
                                    <Button variant="outline" disabled>
                                        {t('modalBusy')}
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {showTermApplyModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="w-[360px] rounded-lg bg-white p-6 text-center shadow-lg dark:bg-gray-900">
                        <div className="flex flex-col items-center gap-3">
                            <Coffee className="h-8 w-8 text-amber-600" />
                            <div className="text-sm font-medium">{t('termsInit')}</div>
                            <div className="w-full space-y-2 text-left text-xs">
                                <div className="flex items-center justify-between rounded border bg-muted/30 px-2 py-1">
                                    <div className="flex items-center gap-2">
                                        {termPct >= 100 ? (
                                            <SquareCheckBig className="h-3 w-3 text-emerald-600" />
                                        ) : termFlow === 'extracting' ? (
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                            <Square className="h-3 w-3 text-muted-foreground" />
                                        )}
                                        <span>{t('step1')}</span>
                                    </div>
                                    <div className="text-muted-foreground">
                                        {Math.max(0, Math.min(100, termPct))}%
                                    </div>
                                </div>
                                <div className="flex items-center justify-between rounded border bg-muted/20 px-2 py-1">
                                    <div className="flex items-center gap-2">
                                        {applyStatsInsert ? (
                                            <SquareCheckBig className="h-3 w-3 text-emerald-600" />
                                        ) : termFlow === 'applying' ? (
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                            <Square className="h-3 w-3 text-muted-foreground" />
                                        )}
                                        <span>{t('step2')}</span>
                                    </div>
                                    <div className="text-muted-foreground">
                                        {applyStatsInsert
                                            ? `${t('statsInserted', { n: applyStatsInsert.inserted })}${applyStatsInsert.updated ? ` ${t('statsUpdated', { n: applyStatsInsert.updated })}` : ''}`
                                            : termFlow === 'applying'
                                                ? t('statusTranslating')
                                                : t('statusPending')}
                                    </div>
                                </div>
                                <div className="flex items-center justify-between rounded border bg-muted/10 px-2 py-1">
                                    <div className="flex items-center gap-2">
                                        {autoApplyTerms ? (
                                            applyStatsTranslate ? (
                                                <SquareCheckBig className="h-3 w-3 text-emerald-600" />
                                            ) : termFlow === 'translating' ? (
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                            ) : (
                                                <Square className="h-3 w-3 text-muted-foreground" />
                                            )
                                        ) : (
                                            <Square className="h-3 w-3 text-muted-foreground" />
                                        )}
                                        <span>{t('step3')}</span>
                                    </div>
                                    <div className="text-muted-foreground">
                                        {autoApplyTerms
                                            ? translateCount !== null
                                                ? `${t('statsInserted', { n: translateCount })}`
                                                : termFlow === 'translating'
                                                    ? t('statusTranslating')
                                                    : t('statusPending')
                                            : t('statusOff')}
                                    </div>
                                </div>
                            </div>
                            <div className="mt-2 flex gap-2">
                                {termFlow === 'idle' || termFlow === 'extracting' ? (
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            setCancelTermApplyRequested(true);
                                            if (termApplyTimerRef.current)
                                                clearTimeout(termApplyTimerRef.current);
                                            setShowTermApplyModal(false);
                                            setTermFlow('idle');
                                        }}
                                    >
                                        {t('modalStop')}
                                    </Button>
                                ) : termFlow !== 'done' ? (
                                    <Button variant="outline" disabled>
                                        {t('modalBusy')}
                                    </Button>
                                ) : null}
                                {termFlow === 'done' && (
                                    <Button
                                        onClick={() => {
                                            setShowTermApplyModal(false);
                                            updateStep('done');
                                        }}
                                    >
                                        {t('complete')}
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
