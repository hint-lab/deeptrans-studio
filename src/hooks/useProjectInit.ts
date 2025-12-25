'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
    ensure,
    reset,
    setBatchId,
    setProgress,
    setStep,
    type InitStep,
} from '@/store/features/projectInitSlice';

export function useProjectInit(projectId: string | undefined) {
    const dispatch = useAppDispatch();
    const pid = String(projectId || '');
    useEffect(() => {
        if (!pid) return;
        dispatch(ensure({ projectId: pid }));
    }, [dispatch, pid]);

    const entry = useAppSelector(s => (pid ? s.projectInit?.byProjectId?.[pid] : undefined));

    const updateBatchId = useCallback(
        (next: string) => {
            if (!pid) return;
            dispatch(setBatchId({ projectId: pid, batchId: next }));
        },
        [dispatch, pid]
    );

    const restart = useCallback(() => {
        if (!pid) return;
        dispatch(reset({ projectId: pid }));
    }, [dispatch, pid]);

    const updateStep = useCallback(
        (step: InitStep) => {
            if (!pid) return;
            dispatch(setStep({ projectId: pid, step }));
        },
        [dispatch, pid]
    );

    const updateProgress = useCallback(
        (segPct?: number, termPct?: number) => {
            if (!pid) return;
            dispatch(setProgress({ projectId: pid, segPct, termPct }));
        },
        [dispatch, pid]
    );

    return useMemo(
        () => ({
            entry,
            restart,
            updateBatchId,
            updateStep,
            updateProgress,
        }),
        [entry, restart, updateBatchId, updateStep, updateProgress]
    );
}
