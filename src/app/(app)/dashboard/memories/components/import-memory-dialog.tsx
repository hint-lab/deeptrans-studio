'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    AlertTriangle,
    CheckCircle2,
    Clock3,
    Eye,
    ExternalLink,
    FileCode2,
    FileSpreadsheet,
    FileText,
    Loader2,
    RefreshCw,
    Settings,
} from 'lucide-react';
import { LANGUAGES } from '@/constants/languages';
import { toast } from 'sonner';
import { listMemoriesAction } from '@/actions/memories';
import {
    createMemoryImportPreviewRows,
    detectMemoryImportColumns,
    type MemoryImportPreviewRecord,
} from '@/lib/memory-import-preview';
import { MAX_TRANSLATION_MEMORY_IMPORT_PAIRS } from '@/lib/memory-import-validation';
import {
    parseMemoryImportDelimited,
    type MemoryImportDelimitedParseError,
} from '@/lib/memory-import-delimited';
import {
    MEMORY_IMPORT_POLL_INTERVAL_MS,
    decideMemoryImportTracking,
    memoryImportBlocksNewSubmission,
    memoryImportRecoveryStorageKey,
    parseMemoryImportRecoveryRecords,
    removeMemoryImportRecoveryRecord,
    upsertMemoryImportRecoveryRecord,
    type MemoryImportRecoveryRecord,
} from '@/lib/memory-import-recovery';
import { MEMORY_IMPORT_COMPLETION_UNCONFIRMED_CODE } from '@/lib/memory-import-ambiguity';
import {
    classifyMemoryImportClientFailure,
    memoryImportProtocolError,
    MEMORY_IMPORT_CLIENT_PROTOCOL_CODES,
    type MemoryImportClientFailure,
} from '@/lib/memory-import-client-error';
import { useTranslations } from 'next-intl';

const PREVIEW_ROW_LIMIT = 10;
type ImportStage = 'uploading' | 'queued' | 'parsing' | 'embedding' | 'vector' | 'complete';
type ImportTrackingActivity =
    | 'idle'
    | 'watching'
    | 'awaiting-worker'
    | 'background'
    | 'failed'
    | 'status-error'
    | 'acknowledging'
    | 'complete';

type ImportStatusData = {
    state?: string;
    progress?: unknown;
    result?: { total?: number; indexed?: number; memoryId?: string } | null;
    error?: string | null;
    worker?: { status?: unknown } | null;
};

type ApiResultError = Error & { status?: number; code?: string; publicError?: unknown };

async function readApiResult(response: Response, fallback: string) {
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) {
        // The payload can come from an intermediary or an older server. Keep
        // it separate from Error.message so it can only be used by the
        // bounded classifier below, never displayed as an arbitrary string.
        const error = new Error(fallback) as ApiResultError;
        error.status = response.status;
        error.code = typeof payload?.code === 'string' ? payload.code : undefined;
        error.publicError = typeof payload?.error === 'string' ? payload.error : undefined;
        throw error;
    }
    return payload.data;
}

export function ImportMemoryDialog({ onCompleted }: { onCompleted?: () => void }) {
    const t = useTranslations('Dashboard.Memories.ImportDialog');
    const common = useTranslations('Common');
    const langsT = useTranslations('Common.languages');
    const languages = LANGUAGES;
    const [open, setOpen] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [fileInputNonce, setFileInputNonce] = useState(0);
    const [memoryId, setMemoryId] = useState('');
    const [memories, setMemories] = useState<Array<{ id: string; name: string }>>([]);
    const [loadingMemories, setLoadingMemories] = useState(false);
    const [memoryListLoadError, setMemoryListLoadError] = useState('');
    const [sourceLang, setSourceLang] = useState('');
    const [targetLang, setTargetLang] = useState('');
    const [sourceKey, setSourceKey] = useState('source');
    const [targetKey, setTargetKey] = useState('target');
    const [notesKey, setNotesKey] = useState('notes');
    const [submitting, setSubmitting] = useState(false);
    const [previewRecords, setPreviewRecords] = useState<MemoryImportPreviewRecord[]>([]);
    const [previewLines, setPreviewLines] = useState<string[]>([]);
    const [fileValidationError, setFileValidationError] = useState('');
    const [submittingUI, setSubmittingUI] = useState(false);
    const [progress, setProgress] = useState(0);
    const [currentBatch, setCurrentBatch] = useState(0);
    const [totalBatches, setTotalBatches] = useState(0);
    const [stage, setStage] = useState<ImportStage>('uploading');
    const [recoveryScope, setRecoveryScope] = useState('');
    const [loadingRecoveryScope, setLoadingRecoveryScope] = useState(false);
    const [recoveryLoadError, setRecoveryLoadError] = useState('');
    const [recoveryJobs, setRecoveryJobs] = useState<MemoryImportRecoveryRecord[]>([]);
    const [trackedJobId, setTrackedJobId] = useState('');
    const [trackingActivity, setTrackingActivity] = useState<ImportTrackingActivity>('idle');
    const [trackingMessage, setTrackingMessage] = useState('');
    const [confirmingUnconfirmedJobId, setConfirmingUnconfirmedJobId] = useState('');
    const [acknowledgingUnconfirmedJobId, setAcknowledgingUnconfirmedJobId] = useState('');
    const recoveryScopeRef = useRef('');
    const recoveryJobsRef = useRef<MemoryImportRecoveryRecord[]>([]);
    const pollRunRef = useRef(0);
    const recoveryLoadRunRef = useRef(0);
    const memoryListLoadRunRef = useRef(0);

    const messageForImportFailure = (
        failure: MemoryImportClientFailure,
        context: 'upload' | 'enqueue' | 'status' | 'acknowledge' | 'job'
    ) => {
        switch (failure.kind) {
            case 'unconfirmed':
                return t('unconfirmedImport');
            case 'empty-pairs':
                return t('emptyPairs');
            case 'pair-limit':
                return t('importPairLimitExceeded', {
                    count: failure.pairCount,
                    limit: MAX_TRANSLATION_MEMORY_IMPORT_PAIRS,
                });
            case 'malformed-file':
                return t('importFileFormatInvalid');
            case 'auth-required':
                return t('authRequired');
            case 'access-denied':
                return context === 'status' ? t('recoveryJobUnavailable') : t('accessDenied');
            case 'file-too-large':
                return t('fileTooLarge');
            case 'conflict':
                return context === 'acknowledge'
                    ? t('acknowledgementStateChanged')
                    : context === 'status'
                      ? t('statusFailed')
                      : t('resumePendingImport');
            case 'missing-job-id':
                return t('missingJobId');
            case 'recovery-unavailable':
                if (context === 'acknowledge') return t('acknowledgementUnavailable');
                if (context === 'status') return t('statusFailed');
                if (context === 'job') return t('jobFailed');
                return context === 'upload' ? t('uploadFailed') : t('recoveryUnavailable');
            default:
                if (context === 'status') return t('statusFailed');
                if (context === 'job') return t('jobFailed');
                if (context === 'acknowledge') return t('acknowledgementUnavailable');
                return context === 'upload' ? t('uploadFailed') : t('enqueueFailed');
        }
    };

    const messageForDelimitedPreviewError = (error: MemoryImportDelimitedParseError) => {
        const key =
            error.code === 'UNTERMINATED_QUOTE'
                ? 'malformedDelimitedUnterminatedQuote'
                : error.code === 'UNEXPECTED_QUOTE'
                  ? 'malformedDelimitedUnexpectedQuote'
                  : 'malformedDelimitedTrailingCharacter';
        return t(key, { line: error.line, column: error.column });
    };

    const replaceRecoveryJobs = (
        next: MemoryImportRecoveryRecord[],
        scope = recoveryScopeRef.current
    ) => {
        recoveryJobsRef.current = next;
        setRecoveryJobs(next);
        const storageKey = memoryImportRecoveryStorageKey(scope);
        if (!storageKey || typeof window === 'undefined') return;
        try {
            if (next.length) window.localStorage.setItem(storageKey, JSON.stringify(next));
            else window.localStorage.removeItem(storageKey);
        } catch {
            // Storage is only a resume convenience. Queue ownership is still
            // enforced server-side, so quota/private-mode failures are safe.
        }
    };

    const rememberRecoveryJob = (record: MemoryImportRecoveryRecord) => {
        replaceRecoveryJobs(upsertMemoryImportRecoveryRecord(recoveryJobsRef.current, record));
    };

    const updateRecoveryJobState = (jobId: string, lastState?: string) => {
        const record = recoveryJobsRef.current.find(candidate => candidate.jobId === jobId);
        if (!record) return;
        rememberRecoveryJob({ ...record, ...(lastState ? { lastState } : {}) });
    };

    const forgetRecoveryJob = (jobId: string) => {
        replaceRecoveryJobs(removeMemoryImportRecoveryRecord(recoveryJobsRef.current, jobId));
    };

    const refreshMemoryList = useCallback(async () => {
        const runId = ++memoryListLoadRunRef.current;
        setLoadingMemories(true);
        setMemoryListLoadError('');
        // A failed refresh must not retain a previous account's visible
        // library list or make an unavailable list look like an empty one.
        setMemories([]);
        setMemoryId('');

        try {
            const res = (await listMemoriesAction()) as {
                success?: unknown;
                data?: unknown;
            };
            if (res?.success !== true || !Array.isArray(res.data)) {
                throw new Error('memory-list-unavailable');
            }
            if (runId !== memoryListLoadRunRef.current) return;
            setMemories(
                res.data.map((memory: any) => ({
                    id: String(memory?.id || ''),
                    name: String(memory?.name || ''),
                }))
            );
        } catch {
            if (runId !== memoryListLoadRunRef.current) return;
            setMemories([]);
            setMemoryId('');
            setMemoryListLoadError(t('memoryListUnavailable'));
        } finally {
            if (runId === memoryListLoadRunRef.current) setLoadingMemories(false);
        }
    }, [t]);

    // A memory-list failure is a blocking state, not evidence that the user
    // has no libraries. Request generations prevent a late response after a
    // close/reopen from overwriting the current dialog.
    useEffect(() => {
        if (!open) return;
        void refreshMemoryList();
        return () => {
            memoryListLoadRunRef.current += 1;
        };
    }, [open, refreshMemoryList]);

    /**
     * Resolve the authenticated recovery namespace before trusting browser
     * storage. This is also used after a rejected enqueue: the server may
     * have just created a durable ambiguity gate that the open dialog needs
     * to show immediately.
     */
    const refreshRecoveryJobs = useCallback(async () => {
        const runId = ++recoveryLoadRunRef.current;
        setLoadingRecoveryScope(true);
        setRecoveryLoadError('');
        recoveryScopeRef.current = '';
        setRecoveryScope('');
        recoveryJobsRef.current = [];
        setRecoveryJobs([]);

        try {
            const data = await readApiResult(
                await fetch('/api/memories/import', { cache: 'no-store' }),
                t('recoveryUnavailable')
            );
            if (runId !== recoveryLoadRunRef.current) return false;

            const scope = String(data?.recoveryScope || '').trim();
            if (!scope) throw new Error(t('recoveryUnavailable'));
            recoveryScopeRef.current = scope;
            setRecoveryScope(scope);

            const storageKey = memoryImportRecoveryStorageKey(scope);
            let restored: MemoryImportRecoveryRecord[] = [];
            if (storageKey && typeof window !== 'undefined') {
                try {
                    restored = parseMemoryImportRecoveryRecords(
                        window.localStorage.getItem(storageKey)
                    );
                } catch {
                    // Storage is a resume convenience only. The server gate
                    // remains authoritative when a browser blocks storage.
                }
            }
            const unconfirmedRecoveries: MemoryImportRecoveryRecord[] = Array.isArray(
                data?.unconfirmedImports
            )
                ? data.unconfirmedImports
                      .map((value: any): MemoryImportRecoveryRecord | null => {
                          const jobId = String(value?.jobId || '').trim();
                          const memoryId = String(value?.memoryId || '').trim();
                          const memoryName =
                              typeof value?.memoryName === 'string'
                                  ? value.memoryName.trim().slice(0, 200)
                                  : '';
                          const detectedAt = Date.parse(String(value?.detectedAt || ''));
                          if (!jobId || !memoryId) return null;
                          return {
                              version: 1,
                              jobId,
                              memoryId,
                              ...(memoryName ? { memoryName } : {}),
                              createdAt: Number.isFinite(detectedAt) ? detectedAt : Date.now(),
                              lastState: 'unconfirmed',
                          };
                      })
                      .filter(
                          (
                              record: MemoryImportRecoveryRecord | null
                          ): record is MemoryImportRecoveryRecord => Boolean(record)
                      )
                : [];
            const reservedRecoveries: MemoryImportRecoveryRecord[] = Array.isArray(
                data?.reservedImports
            )
                ? data.reservedImports
                      .map((value: any): MemoryImportRecoveryRecord | null => {
                          const jobId = String(value?.jobId || '').trim();
                          const memoryId = String(value?.memoryId || '').trim();
                          const memoryName =
                              typeof value?.memoryName === 'string'
                                  ? value.memoryName.trim().slice(0, 200)
                                  : '';
                          const createdAt = Date.parse(String(value?.createdAt || ''));
                          if (!jobId || !memoryId) return null;
                          return {
                              version: 1,
                              jobId,
                              memoryId,
                              ...(memoryName ? { memoryName } : {}),
                              createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
                              lastState: 'waiting',
                          };
                      })
                      .filter(
                          (
                              record: MemoryImportRecoveryRecord | null
                          ): record is MemoryImportRecoveryRecord => Boolean(record)
                      )
                : [];

            // A server gate is authoritative over an older browser state.
            // Replace, rather than merely append, the matching local job so
            // its warning cannot be hidden by a newer local timestamp.
            const unconfirmedJobIds = new Set(unconfirmedRecoveries.map(record => record.jobId));
            const serverRecoveries = [
                ...reservedRecoveries.filter(record => !unconfirmedJobIds.has(record.jobId)),
                ...unconfirmedRecoveries,
            ];
            const serverRecoveryJobIds = new Set(serverRecoveries.map(record => record.jobId));
            restored = parseMemoryImportRecoveryRecords([
                ...restored.filter(record => !serverRecoveryJobIds.has(record.jobId)),
                ...serverRecoveries,
            ]);
            if (runId !== recoveryLoadRunRef.current) return false;

            recoveryJobsRef.current = restored;
            setRecoveryJobs(restored);
            if (storageKey && typeof window !== 'undefined') {
                try {
                    if (restored.length)
                        window.localStorage.setItem(storageKey, JSON.stringify(restored));
                    else window.localStorage.removeItem(storageKey);
                } catch {
                    // Recovery remains safe without local storage because a
                    // fresh authenticated server snapshot is required before
                    // any new submission.
                }
            }
            return true;
        } catch {
            if (runId !== recoveryLoadRunRef.current) return false;
            recoveryScopeRef.current = '';
            setRecoveryScope('');
            recoveryJobsRef.current = [];
            setRecoveryJobs([]);
            setRecoveryLoadError(t('recoveryUnavailable'));
            return false;
        } finally {
            if (runId === recoveryLoadRunRef.current) setLoadingRecoveryScope(false);
        }
    }, [t]);

    useEffect(() => {
        if (!open) return;
        void refreshRecoveryJobs();
        return () => {
            recoveryLoadRunRef.current += 1;
        };
    }, [open, refreshRecoveryJobs]);

    useEffect(() => {
        return () => {
            pollRunRef.current += 1;
        };
    }, []);

    const previewRows = useMemo(
        () =>
            createMemoryImportPreviewRows(previewRecords, {
                sourceKey,
                targetKey,
                notesKey,
            }),
        [notesKey, previewRecords, sourceKey, targetKey]
    );

    const applyDetectedMapping = (headers: string[]) => {
        const detected = detectMemoryImportColumns(headers, {
            sourceKey,
            targetKey,
            notesKey,
        });
        setSourceKey(detected.sourceKey);
        setTargetKey(detected.targetKey);
        setNotesKey(detected.notesKey);
    };

    const clearSelectedFile = () => {
        setFile(null);
        setFileInputNonce(value => value + 1);
        setPreviewRecords([]);
        setPreviewLines([]);
        setFileValidationError('');
    };

    const handleFileChange = async (f: File | null) => {
        setFile(f);
        setPreviewRecords([]);
        setPreviewLines([]);
        setFileValidationError('');
        if (!f) return;
        if (f.size === 0) {
            setFileValidationError(t('emptyFile'));
            return;
        }
        try {
            const name = f.name.toLowerCase();
            const ext = name.slice(name.lastIndexOf('.') + 1);
            if (ext === 'xlsx' || ext === 'xls') {
                const XLSX = await import('xlsx');
                const buf = await f.arrayBuffer();
                const wb = XLSX.read(buf, { type: 'array' });
                const sn = wb.SheetNames[0];
                const ws = sn ? wb.Sheets[sn] : undefined;
                const rows: any[] = ws ? XLSX.utils.sheet_to_json(ws, { defval: '' }) : [];
                if (rows.length === 0) {
                    setFileValidationError(t('emptyPairs'));
                    return;
                }
                if (rows.length > 0) applyDetectedMapping(Object.keys(rows[0]));
                setPreviewRecords(rows.slice(0, PREVIEW_ROW_LIMIT));
            } else if (ext === 'csv' || ext === 'tsv') {
                const txt = await f.text();
                const parsed = parseMemoryImportDelimited(txt, {
                    format: ext,
                    mapping: { sourceKey, targetKey, notesKey },
                });
                if (!parsed.ok) {
                    setFileValidationError(messageForDelimitedPreviewError(parsed.error));
                    return;
                }
                applyDetectedMapping(parsed.headers);
                setPreviewRecords(
                    parsed.records
                        .slice(0, PREVIEW_ROW_LIMIT)
                        .map(record =>
                            Object.fromEntries(
                                parsed.headers.map((column, index) => [column, record[index] ?? ''])
                            )
                        )
                );
            } else if (ext === 'tmx' || ext === 'xml') {
                const txt = await f.text();
                setPreviewLines(txt.split(/\r?\n/).slice(0, PREVIEW_ROW_LIMIT));
            } else {
                setFileValidationError(t('unsupportedFileType', { extension: ext || '—' }));
            }
        } catch {
            setFileValidationError(t('previewUnavailable'));
        }
    };

    const applyImportProgress = (progressValue: unknown) => {
        if (progressValue && typeof progressValue === 'object') {
            const progressData = progressValue as Record<string, unknown>;
            if (typeof progressData.progress === 'number') setProgress(progressData.progress);
            if (typeof progressData.currentBatch === 'number') {
                setCurrentBatch(progressData.currentBatch);
            }
            if (typeof progressData.totalBatches === 'number') {
                setTotalBatches(progressData.totalBatches);
            }
            if (
                progressData.stage === 'parsing' ||
                progressData.stage === 'embedding' ||
                progressData.stage === 'vector'
            ) {
                setStage(progressData.stage);
            }
        } else if (typeof progressValue === 'number') {
            setProgress(progressValue);
        }
    };

    const pauseTracking = (
        jobId: string,
        activity: Exclude<ImportTrackingActivity, 'idle' | 'watching' | 'complete'>,
        message: string,
        lastState?: string
    ) => {
        updateRecoveryJobState(jobId, lastState);
        setTrackingActivity(activity);
        setTrackingMessage(message);
        if (activity === 'failed') {
            // A failed queue job is never silently retried from the still-held
            // File object. The user must explicitly select the file again.
            clearSelectedFile();
        }
        setSubmitting(false);
        // Keep the card visible after polling has stopped. The dialog is no
        // longer locked; the user can close it and later reattach safely.
        setSubmittingUI(true);
    };

    const trackImportJob = async (record: MemoryImportRecoveryRecord) => {
        const runId = ++pollRunRef.current;
        let pollAttempt = 0;
        setTrackedJobId(record.jobId);
        setTrackingActivity('watching');
        setTrackingMessage('');
        setSubmitting(true);
        setSubmittingUI(true);

        while (pollRunRef.current === runId) {
            let statusData: ImportStatusData;
            try {
                statusData = (await readApiResult(
                    await fetch(
                        `/api/memories/import/status?jobId=${encodeURIComponent(record.jobId)}&memoryId=${encodeURIComponent(record.memoryId)}`,
                        { cache: 'no-store' }
                    ),
                    t('statusFailed')
                )) as ImportStatusData;
            } catch (error) {
                if (pollRunRef.current !== runId) return;
                const apiError = error as ApiResultError;
                if (apiError.status === 403 || apiError.status === 404) {
                    // A persisted browser reference must never be reusable by
                    // a different account, and a job that is no longer
                    // addressable must not keep a local record alive.
                    forgetRecoveryJob(record.jobId);
                    pauseTracking(record.jobId, 'status-error', t('recoveryJobUnavailable'));
                } else if (
                    apiError.status === 409 &&
                    apiError.code === MEMORY_IMPORT_COMPLETION_UNCONFIRMED_CODE
                ) {
                    // Neither a queue-only completed job nor a pruned old job
                    // proves that its rows are absent. Keep the local pointer
                    // and let the server persist a per-memory gate before the
                    // owner explicitly reviews and releases it.
                    pauseTracking(
                        record.jobId,
                        'status-error',
                        t('unconfirmedImport'),
                        'unconfirmed'
                    );
                } else {
                    pauseTracking(
                        record.jobId,
                        'status-error',
                        messageForImportFailure(
                            classifyMemoryImportClientFailure(apiError),
                            'status'
                        )
                    );
                }
                return;
            }

            if (pollRunRef.current !== runId) return;
            const state = String(statusData.state || 'unknown');
            updateRecoveryJobState(record.jobId, state);
            applyImportProgress(statusData.progress);
            const decision = decideMemoryImportTracking({
                state,
                workerStatus: statusData.worker?.status,
                pollAttempt,
            });

            if (decision.kind === 'completed') {
                const result = statusData.result;
                if (
                    !result ||
                    typeof result.total !== 'number' ||
                    typeof result.indexed !== 'number'
                ) {
                    // The queue says terminal success, but the client cannot
                    // verify the result. Keep the job reference and block a
                    // replacement submission rather than risking duplicates.
                    pauseTracking(record.jobId, 'status-error', t('invalidJobResult'), state);
                    return;
                }
                forgetRecoveryJob(record.jobId);
                setProgress(100);
                setStage('complete');
                setTrackingActivity('complete');
                setTrackingMessage('');
                setSubmitting(false);
                toast.success(common('success'), {
                    description: t('importSuccess', {
                        total: result.total,
                        indexed: result.indexed,
                    }),
                });
                window.setTimeout(() => {
                    if (pollRunRef.current !== runId) return;
                    setOpen(false);
                    clearSelectedFile();
                    setSubmittingUI(false);
                    onCompleted?.();
                }, 1_000);
                return;
            }

            if (decision.kind === 'acknowledged') {
                forgetRecoveryJob(record.jobId);
                setTrackedJobId('');
                setTrackingActivity('idle');
                setTrackingMessage('');
                setSubmitting(false);
                setSubmittingUI(false);
                clearSelectedFile();
                toast.info(t('unconfirmedImportAlreadyReleased'));
                return;
            }

            if (decision.kind === 'failed') {
                pauseTracking(
                    record.jobId,
                    'failed',
                    messageForImportFailure(
                        classifyMemoryImportClientFailure({ publicError: statusData.error }),
                        'job'
                    ),
                    state
                );
                return;
            }

            if (decision.kind === 'awaiting-worker') {
                pauseTracking(
                    record.jobId,
                    'awaiting-worker',
                    t(decision.problem === 'stale' ? 'workerStale' : 'workerUnavailable'),
                    state
                );
                return;
            }

            if (decision.kind === 'background') {
                pauseTracking(record.jobId, 'background', t('backgroundPollingPaused'), state);
                return;
            }

            pollAttempt += 1;
            await new Promise(resolve =>
                window.setTimeout(resolve, MEMORY_IMPORT_POLL_INTERVAL_MS)
            );
        }
    };

    const handleSubmit = async () => {
        if (!file) {
            toast.error(common('error'), { description: t('selectFileRequired') });
            return;
        }
        if (memoryListLoadError || loadingMemories) {
            toast.error(common('error'), { description: t('memoryListUnavailable') });
            return;
        }
        if (!memoryId) {
            toast.error(common('error'), { description: t('selectMemoryRequired') });
            return;
        }
        if (!recoveryScope || loadingRecoveryScope) {
            toast.error(common('error'), { description: t('recoveryUnavailable') });
            return;
        }
        if (memoryImportBlocksNewSubmission(recoveryJobs, memoryId)) {
            toast.error(common('error'), { description: t('resumePendingImport') });
            return;
        }
        if (fileValidationError) {
            toast.error(common('error'), { description: fileValidationError });
            return;
        }

        setSubmitting(true);
        setSubmittingUI(true);
        setTrackingActivity('watching');
        setTrackingMessage('');
        setProgress(2);
        setCurrentBatch(0);
        setTotalBatches(0);
        setStage('uploading');

        let enqueueRequested = false;
        let requestContext: 'upload' | 'enqueue' = 'upload';
        try {
            const uploadForm = new FormData();
            uploadForm.append('file', file);
            const uploadData = await readApiResult(
                await fetch('/api/upload-proxy', {
                    method: 'POST',
                    body: uploadForm,
                }),
                t('uploadFailed')
            );

            setProgress(5);
            setStage('queued');
            enqueueRequested = true;
            requestContext = 'enqueue';
            const enqueueData = await readApiResult(
                await fetch('/api/memories/import', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        fileKey: uploadData.fileName,
                        fileType: file.name,
                        memoryId,
                        sourceLang: sourceLang || undefined,
                        targetLang: targetLang || undefined,
                        sourceKey,
                        targetKey,
                        notesKey,
                    }),
                }),
                t('enqueueFailed')
            );
            const jobId = String(enqueueData.jobId || '');
            const jobScope = String(enqueueData.recoveryScope || '').trim();
            if (!jobId) {
                throw memoryImportProtocolError(MEMORY_IMPORT_CLIENT_PROTOCOL_CODES.MISSING_JOB_ID);
            }
            if (!jobScope || jobScope !== recoveryScopeRef.current) {
                throw memoryImportProtocolError(
                    MEMORY_IMPORT_CLIENT_PROTOCOL_CODES.RECOVERY_SCOPE_UNAVAILABLE
                );
            }

            const record: MemoryImportRecoveryRecord = {
                version: 1,
                jobId,
                memoryId,
                createdAt: Date.now(),
                lastState: String(enqueueData.state || 'waiting'),
            };
            rememberRecoveryJob(record);
            await trackImportJob(record);
        } catch (error) {
            const apiError = error as ApiResultError;
            const failure = classifyMemoryImportClientFailure(apiError);
            const message = messageForImportFailure(failure, requestContext);
            // The enqueue route can create a durable ambiguity gate (409) or
            // retain a server-side reservation when queue acceptance is
            // uncertain (503). Refresh before unlocking the form so the
            // current dialog exposes the safe recovery path instead of
            // requiring a close/reopen cycle.
            if (
                enqueueRequested &&
                (apiError.status === 409 ||
                    apiError.status === 503 ||
                    failure.kind === 'missing-job-id' ||
                    failure.kind === 'recovery-unavailable')
            ) {
                await refreshRecoveryJobs();
            }
            if (requestContext === 'enqueue' && apiError.status === 409) {
                clearSelectedFile();
            }
            toast.error(common('error'), { description: message });
            setTrackingActivity('status-error');
            setTrackingMessage(message);
            setSubmitting(false);
            setSubmittingUI(false);
        }
    };

    const getFileTypeIcon = () => {
        if (!file) return <FileText className="h-4 w-4" />;
        const name = file.name.toLowerCase();
        if (/(xlsx|xls|csv|tsv)$/.test(name)) {
            return <FileSpreadsheet aria-hidden="true" className="h-4 w-4 text-green-600" />;
        }
        if (/(tmx|xml)$/.test(name)) {
            return <FileCode2 aria-hidden="true" className="h-4 w-4 text-blue-600" />;
        }
        return <FileText className="h-4 w-4" />;
    };

    const selectedMemoryHasPendingImport = memoryImportBlocksNewSubmission(recoveryJobs, memoryId);
    const recoveryInteractionBusy = submitting || Boolean(acknowledgingUnconfirmedJobId);

    const acknowledgeUnconfirmedImport = async (record: MemoryImportRecoveryRecord) => {
        if (recoveryInteractionBusy) return;
        try {
            setAcknowledgingUnconfirmedJobId(record.jobId);
            setSubmitting(true);
            setSubmittingUI(true);
            setTrackingActivity('acknowledging');
            setTrackingMessage(t('acknowledgingUnconfirmedImport'));
            const response = await readApiResult(
                await fetch('/api/memories/import/acknowledge', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jobId: record.jobId,
                        memoryId: record.memoryId,
                        acknowledge: 'release-unconfirmed-import',
                    }),
                }),
                t('statusFailed')
            );
            setConfirmingUnconfirmedJobId('');
            if (response?.durable) {
                // A receipt appeared while the owner was reviewing. Ask the
                // normal status flow to present the verified result instead
                // of treating the acknowledgement as a new import attempt.
                await trackImportJob(record);
                return;
            }
            forgetRecoveryJob(record.jobId);
            setTrackedJobId('');
            setTrackingActivity('idle');
            setTrackingMessage('');
            setSubmitting(false);
            setSubmittingUI(false);
            // A new upload gets a fresh object key and is intentionally a new
            // decision. Do not let a still-held File silently resubmit.
            clearSelectedFile();
            toast.info(t('unconfirmedImportReleased'));
        } catch (error) {
            const apiError = error as ApiResultError;
            const message = messageForImportFailure(
                classifyMemoryImportClientFailure(apiError),
                'acknowledge'
            );
            toast.error(common('error'), { description: message });
            setTrackingActivity('status-error');
            setTrackingMessage(message);
            setSubmitting(false);
            setSubmittingUI(true);
        } finally {
            setAcknowledgingUnconfirmedJobId('');
        }
    };

    const handleDialogOpenChange = (nextOpen: boolean) => {
        // Do not let a close gesture lose the job ID during upload/enqueue.
        // Once polling has paused, the dialog is intentionally closable.
        if (!nextOpen && recoveryInteractionBusy) return;
        if (!nextOpen) {
            pollRunRef.current += 1;
            recoveryLoadRunRef.current += 1;
            setTrackedJobId('');
            setTrackingActivity('idle');
            setTrackingMessage('');
            setConfirmingUnconfirmedJobId('');
            setSubmittingUI(false);
        }
        setOpen(nextOpen);
    };

    return (
        <Dialog open={open} onOpenChange={handleDialogOpenChange}>
            <DialogTrigger asChild>
                <Button>{t('open')}</Button>
            </DialogTrigger>
            <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col">
                <DialogHeader className="flex-shrink-0">
                    <DialogTitle className="flex items-center gap-2">{t('title')}</DialogTitle>
                    <DialogDescription className="text-left">{t('description')}</DialogDescription>
                </DialogHeader>

                <div className="flex-1 space-y-4 overflow-auto">
                    {submittingUI && (
                        <Card
                            aria-atomic="true"
                            aria-live="polite"
                            role="status"
                            className={
                                trackingActivity === 'watching' || trackingActivity === 'complete'
                                    ? 'border-amber-200 bg-amber-50'
                                    : 'border-sky-200 bg-sky-50'
                            }
                        >
                            <CardContent className="space-y-3 py-4">
                                <div className="flex items-center gap-3">
                                    {trackingActivity === 'watching' ||
                                    trackingActivity === 'acknowledging' ? (
                                        <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                                    ) : trackingActivity === 'complete' ? (
                                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                    ) : trackingActivity === 'background' ? (
                                        <Clock3 className="h-4 w-4 text-sky-700" />
                                    ) : (
                                        <AlertTriangle className="h-4 w-4 text-sky-700" />
                                    )}
                                    <span className="text-slate-800">
                                        {trackingActivity === 'watching' &&
                                            stage === 'uploading' &&
                                            t('uploading')}
                                        {trackingActivity === 'watching' &&
                                            stage === 'queued' &&
                                            t('queued')}
                                        {trackingActivity === 'watching' &&
                                            stage === 'parsing' &&
                                            t('parsing')}
                                        {trackingActivity === 'watching' &&
                                            stage === 'embedding' &&
                                            t('embedding')}
                                        {trackingActivity === 'watching' &&
                                            stage === 'vector' &&
                                            t('vector')}
                                        {trackingActivity === 'complete' && t('complete')}
                                        {trackingActivity !== 'watching' &&
                                            trackingActivity !== 'complete' &&
                                            trackingMessage}
                                    </span>
                                </div>

                                {progress > 0 && (
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-xs text-slate-600">
                                            <span>
                                                {totalBatches > 0
                                                    ? t('progressBatches', {
                                                          current: currentBatch,
                                                          total: totalBatches,
                                                      })
                                                    : t('backgroundImportHint')}
                                            </span>
                                            <span>{Math.round(progress)}%</span>
                                        </div>
                                        <div
                                            aria-label={t('progressBatches')}
                                            aria-valuemax={100}
                                            aria-valuemin={0}
                                            aria-valuenow={Math.round(progress)}
                                            aria-valuetext={`${Math.round(progress)}%`}
                                            className="h-2 w-full rounded-full bg-slate-200"
                                            role="progressbar"
                                        >
                                            <div
                                                className="h-2 rounded-full bg-amber-600 transition-all duration-300"
                                                style={{ width: `${progress}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {loadingRecoveryScope && (
                        <p className="text-xs text-muted-foreground">{t('recoveryLoading')}</p>
                    )}

                    {recoveryLoadError && (
                        <div
                            role="alert"
                            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-amber-950"
                        >
                            <span className="flex items-start gap-2 text-sm leading-5">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                {recoveryLoadError}
                            </span>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="border-amber-300 bg-white text-amber-950 hover:bg-amber-100"
                                disabled={recoveryInteractionBusy || loadingRecoveryScope}
                                onClick={() => void refreshRecoveryJobs()}
                            >
                                {loadingRecoveryScope && (
                                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                )}
                                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                                {t('retryRecoveryCheck')}
                            </Button>
                        </div>
                    )}

                    {recoveryJobs.length > 0 && (
                        <Card className="border-sky-200 bg-sky-50/70">
                            <CardContent className="space-y-3 py-4">
                                <div className="flex items-start gap-3">
                                    <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium text-sky-950">
                                            {t('recoverableImports', {
                                                count: recoveryJobs.length,
                                            })}
                                        </p>
                                        <p className="text-xs leading-5 text-sky-800">
                                            {t('backgroundImportHint')}
                                        </p>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    {recoveryJobs.map(record => {
                                        const failed = record.lastState === 'failed';
                                        const unconfirmed = record.lastState === 'unconfirmed';
                                        const recordMemoryName =
                                            record.memoryName ||
                                            memories.find(memory => memory.id === record.memoryId)
                                                ?.name;
                                        const watchingThisJob =
                                            submitting &&
                                            trackedJobId === record.jobId &&
                                            trackingActivity === 'watching';
                                        const confirmingThisJob =
                                            confirmingUnconfirmedJobId === record.jobId;
                                        const acknowledgingThisJob =
                                            acknowledgingUnconfirmedJobId === record.jobId;
                                        return (
                                            <div
                                                key={record.jobId}
                                                className={
                                                    unconfirmed
                                                        ? 'rounded-md border border-amber-200 bg-amber-50/80 px-3 py-3'
                                                        : 'rounded-md border border-sky-100 bg-white/80 px-3 py-2'
                                                }
                                            >
                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                    <div className="min-w-0 space-y-1">
                                                        <span className="flex items-start gap-2 text-xs leading-5 text-slate-700">
                                                            {unconfirmed && (
                                                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
                                                            )}
                                                            <span>
                                                                {unconfirmed
                                                                    ? t('unconfirmedImport')
                                                                    : failed
                                                                      ? t('failedImport')
                                                                      : t('pendingImport')}
                                                            </span>
                                                        </span>
                                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-0 text-xs text-slate-600 sm:pl-5">
                                                            <span>
                                                                {recordMemoryName
                                                                    ? t('recoveryTargetMemory', {
                                                                          name: recordMemoryName,
                                                                      })
                                                                    : t(
                                                                          'recoveryTargetMemoryUnavailable'
                                                                      )}
                                                            </span>
                                                            {recoveryInteractionBusy ? (
                                                                <span
                                                                    aria-disabled="true"
                                                                    className="text-slate-400"
                                                                >
                                                                    {t('viewTargetMemory')}
                                                                </span>
                                                            ) : (
                                                                <Link
                                                                    href={`/dashboard/memories/${encodeURIComponent(record.memoryId)}`}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="inline-flex items-center gap-1 font-medium text-sky-800 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                                                                >
                                                                    {t('viewTargetMemory')}
                                                                    <ExternalLink
                                                                        aria-hidden="true"
                                                                        className="h-3 w-3"
                                                                    />
                                                                </Link>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="outline"
                                                            disabled={recoveryInteractionBusy}
                                                            onClick={() =>
                                                                void trackImportJob(record)
                                                            }
                                                        >
                                                            {watchingThisJob ? (
                                                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                                            ) : (
                                                                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                                                            )}
                                                            {t('resumeImport')}
                                                        </Button>
                                                        {unconfirmed && (
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="outline"
                                                                className="border-amber-300 text-amber-950 hover:bg-amber-100"
                                                                disabled={
                                                                    recoveryInteractionBusy ||
                                                                    acknowledgingThisJob
                                                                }
                                                                onClick={() =>
                                                                    setConfirmingUnconfirmedJobId(
                                                                        confirmingThisJob
                                                                            ? ''
                                                                            : record.jobId
                                                                    )
                                                                }
                                                            >
                                                                {t('releaseUnconfirmedImport')}
                                                            </Button>
                                                        )}
                                                        {failed && (
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="ghost"
                                                                disabled={recoveryInteractionBusy}
                                                                onClick={() =>
                                                                    forgetRecoveryJob(record.jobId)
                                                                }
                                                            >
                                                                {t('dismissFailedImport')}
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                                {unconfirmed && confirmingThisJob && (
                                                    <div
                                                        role="alert"
                                                        className="mt-3 border-t border-amber-200 pt-3"
                                                    >
                                                        <p className="max-w-2xl text-xs leading-5 text-amber-950">
                                                            {t('unconfirmedImportWarning')}
                                                        </p>
                                                        <div className="mt-3 flex flex-wrap gap-2">
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="outline"
                                                                className="border-amber-400 bg-white text-amber-950 hover:bg-amber-100"
                                                                disabled={
                                                                    recoveryInteractionBusy ||
                                                                    acknowledgingThisJob
                                                                }
                                                                onClick={() =>
                                                                    void acknowledgeUnconfirmedImport(
                                                                        record
                                                                    )
                                                                }
                                                            >
                                                                {acknowledgingThisJob && (
                                                                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                                                )}
                                                                {t(
                                                                    'confirmReleaseUnconfirmedImport'
                                                                )}
                                                            </Button>
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="ghost"
                                                                disabled={
                                                                    recoveryInteractionBusy ||
                                                                    acknowledgingThisJob
                                                                }
                                                                onClick={() =>
                                                                    setConfirmingUnconfirmedJobId(
                                                                        ''
                                                                    )
                                                                }
                                                            >
                                                                {common('cancel')}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    <Card className="border-blue-200 bg-blue-50/30">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Settings className="h-4 w-4" />
                                {t('fileAndMappingSettings')}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <div>
                                    <Label className="text-sm font-medium">
                                        {t('targetMemoryOptional')}
                                    </Label>
                                    <Select value={memoryId} onValueChange={v => setMemoryId(v)}>
                                        <SelectTrigger
                                            aria-describedby={
                                                [
                                                    selectedMemoryHasPendingImport
                                                        ? 'memory-import-pending-hint'
                                                        : '',
                                                    memoryListLoadError
                                                        ? 'memory-list-load-error'
                                                        : '',
                                                ]
                                                    .filter(Boolean)
                                                    .join(' ') || undefined
                                            }
                                            className="h-9"
                                            disabled={
                                                recoveryInteractionBusy ||
                                                loadingMemories ||
                                                Boolean(memoryListLoadError)
                                            }
                                        >
                                            <SelectValue
                                                placeholder={
                                                    loadingMemories
                                                        ? t('loadingMemories')
                                                        : t('selectMemoryOptional')
                                                }
                                            />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {memories.map(m => (
                                                <SelectItem key={m.id} value={m.id}>
                                                    {m.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {selectedMemoryHasPendingImport && (
                                        <p
                                            id="memory-import-pending-hint"
                                            role="status"
                                            className="mt-2 text-xs leading-5 text-amber-800"
                                        >
                                            {t('recoveryBlockedSelectedMemory')}
                                        </p>
                                    )}
                                    {memoryListLoadError && (
                                        <div
                                            id="memory-list-load-error"
                                            role="alert"
                                            className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs leading-5 text-amber-950"
                                        >
                                            <span>{memoryListLoadError}</span>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                className="h-7 border-amber-300 bg-white text-amber-950 hover:bg-amber-100"
                                                disabled={
                                                    recoveryInteractionBusy || loadingMemories
                                                }
                                                onClick={() => void refreshMemoryList()}
                                            >
                                                {loadingMemories && (
                                                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                                )}
                                                <RefreshCw className="mr-1 h-3 w-3" />
                                                {t('retryMemoryList')}
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div>
                                <Label className="text-sm font-medium">{t('selectFile')}</Label>
                                <div className="relative">
                                    <Input
                                        key={fileInputNonce}
                                        type="file"
                                        accept=".tmx,.csv,.tsv,.xml,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                                        onChange={e =>
                                            handleFileChange(e.target.files?.[0] || null)
                                        }
                                        className="h-9"
                                        disabled={recoveryInteractionBusy}
                                    />
                                    {file && (
                                        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-2">
                                            {getFileTypeIcon()}
                                            <Badge variant="secondary" className="text-xs">
                                                {file.name.split('.').pop()?.toUpperCase()}
                                            </Badge>
                                        </div>
                                    )}
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {t('supportedFileTypes')}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {t('importPairLimitHint', {
                                        limit: MAX_TRANSLATION_MEMORY_IMPORT_PAIRS,
                                    })}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {t('previewLimitScope', { count: PREVIEW_ROW_LIMIT })}
                                </p>
                                {fileValidationError && (
                                    <p
                                        role="alert"
                                        className="mt-2 rounded border border-destructive/25 bg-destructive/5 px-2.5 py-2 text-xs leading-5 text-destructive"
                                    >
                                        {fileValidationError}
                                    </p>
                                )}
                            </div>

                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label>{t('sourceLanguageOptional')}</Label>
                                    <Select
                                        disabled={recoveryInteractionBusy}
                                        value={sourceLang}
                                        onValueChange={v => setSourceLang(v)}
                                    >
                                        <SelectTrigger className="h-9">
                                            <SelectValue
                                                placeholder={t('selectSourceLanguageOptional')}
                                            />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {languages.map(l => (
                                                <SelectItem key={l.key} value={l.key}>
                                                    {langsT(l.key)}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>{t('targetLanguageOptional')}</Label>
                                    <Select
                                        disabled={recoveryInteractionBusy}
                                        value={targetLang}
                                        onValueChange={v => setTargetLang(v)}
                                    >
                                        <SelectTrigger className="h-9">
                                            <SelectValue
                                                placeholder={t('selectTargetLanguageOptional')}
                                            />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {languages.map(l => (
                                                <SelectItem key={l.key} value={l.key}>
                                                    {langsT(l.key)}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                <div>
                                    <Label className="text-sm">{t('sourceColumn')}</Label>
                                    <Input
                                        value={sourceKey}
                                        onChange={e => setSourceKey(e.target.value)}
                                        className="h-8"
                                        placeholder="source"
                                        disabled={recoveryInteractionBusy}
                                    />
                                </div>
                                <div>
                                    <Label className="text-sm">{t('targetColumn')}</Label>
                                    <Input
                                        value={targetKey}
                                        onChange={e => setTargetKey(e.target.value)}
                                        className="h-8"
                                        placeholder="target"
                                        disabled={recoveryInteractionBusy}
                                    />
                                </div>
                                <div>
                                    <Label className="text-sm">{t('notesColumnOptional')}</Label>
                                    <Input
                                        value={notesKey}
                                        onChange={e => setNotesKey(e.target.value)}
                                        className="h-8"
                                        placeholder="notes"
                                        disabled={recoveryInteractionBusy}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Eye className="h-4 w-4" />
                                {t('filePreview')}
                                {previewRows.length + previewLines.length > 0 && (
                                    <Badge variant="outline" className="ml-2">
                                        {t('previewLineCount', {
                                            count: previewRows.length || previewLines.length,
                                        })}
                                    </Badge>
                                )}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="max-h-72 overflow-auto rounded-lg border bg-slate-50/70">
                                {previewRows.length > 0 ? (
                                    <table className="w-full min-w-[720px] table-fixed text-left text-xs">
                                        <thead className="sticky top-0 z-10 bg-slate-100 text-slate-600 shadow-[0_1px_0_0_theme(colors.slate.200)]">
                                            <tr>
                                                <th
                                                    scope="col"
                                                    className="w-[38%] px-3 py-2.5 font-medium"
                                                >
                                                    {t('previewSource')}
                                                    <span className="ml-1.5 font-mono text-[10px] font-normal text-slate-400">
                                                        source
                                                    </span>
                                                </th>
                                                <th
                                                    scope="col"
                                                    className="w-[38%] border-l border-slate-200 px-3 py-2.5 font-medium"
                                                >
                                                    {t('previewTarget')}
                                                    <span className="ml-1.5 font-mono text-[10px] font-normal text-slate-400">
                                                        target
                                                    </span>
                                                </th>
                                                <th
                                                    scope="col"
                                                    className="w-[24%] border-l border-slate-200 px-3 py-2.5 font-medium"
                                                >
                                                    {t('previewNotes')}
                                                    <span className="ml-1.5 font-mono text-[10px] font-normal text-slate-400">
                                                        notes
                                                    </span>
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200 bg-white">
                                            {previewRows.map((row, index) => (
                                                <tr
                                                    key={index}
                                                    className="align-top hover:bg-indigo-50/40"
                                                >
                                                    <td className="whitespace-pre-wrap break-words px-3 py-3 leading-5 text-slate-800">
                                                        {row.source || '—'}
                                                    </td>
                                                    <td className="whitespace-pre-wrap break-words border-l border-slate-100 px-3 py-3 leading-5 text-slate-800">
                                                        {row.target || '—'}
                                                    </td>
                                                    <td className="whitespace-pre-wrap break-words border-l border-slate-100 px-3 py-3 leading-5 text-slate-600">
                                                        {row.notes || '—'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : previewLines.length > 0 ? (
                                    <div className="space-y-1 font-mono text-xs">
                                        {previewLines.map((line, idx) => (
                                            <div
                                                key={idx}
                                                className="px-4 leading-relaxed text-slate-700 first:pt-4 last:pb-4"
                                            >
                                                {line}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="py-8 text-center text-sm text-slate-500">
                                        {t('previewPlaceholder')}
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="flex flex-shrink-0 items-center justify-between border-t pt-4">
                    <div className="text-sm text-muted-foreground">
                        {file ? t('selectedFile', { name: file.name }) : t('selectFileHint')}
                    </div>
                    <div className="flex gap-3">
                        <Button
                            variant="outline"
                            onClick={() => handleDialogOpenChange(false)}
                            disabled={recoveryInteractionBusy}
                        >
                            {common('cancel')}
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={
                                recoveryInteractionBusy ||
                                loadingRecoveryScope ||
                                !recoveryScope ||
                                loadingMemories ||
                                Boolean(memoryListLoadError) ||
                                selectedMemoryHasPendingImport ||
                                !file ||
                                !memoryId ||
                                Boolean(fileValidationError)
                            }
                            className="min-w-[120px]"
                        >
                            {submitting ? (
                                <span className="inline-flex items-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    {t('importing')}
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4" />
                                    {t('startImport')}
                                </span>
                            )}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
