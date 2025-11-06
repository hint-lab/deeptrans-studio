import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  setPreStep,
  setQAStep,
  setPeStep,
  setPreRunning,
  setQARunning,
  setPERunning,
  setPreOutputs,
  setPreTermEnabled,
  setPreTermEnabledBulk,
  setPreDictEnabled,
  setQAOutputs,
  setQASyntaxTranslation,
  setQASyntaxEmbedded,
  setQADislikedPairs,
  setPosteditOutputs,
  setPosteditFinalized,
  setBaselineTranslation,
  setAllOutputs
} from '@/store/features/workFlowStepSlice';

// 兼容旧用法：useAgentWorkflowSteps(selector?)
export function useAgentWorkflowSteps<T = any>(selector?: (s: any) => T): T | any {
  const dispatch = useAppDispatch();
  const state = useAppSelector((s) => (s as any).workFlowStep || {});

  const api = {
    ...state,
    setBaselineTranslation: (v: string | undefined) => dispatch(setBaselineTranslation(v)),
    setPreStep: (v: any) => dispatch(setPreStep(v)),
    setQAStep: (v: any) => dispatch(setQAStep(v)),
    setPeStep: (v: any) => dispatch(setPeStep(v)),
    setPreRunning: (v: boolean) => dispatch(setPreRunning(v)),
    setQARunning: (v: boolean) => dispatch(setQARunning(v)),
    setPERunning: (v: boolean) => dispatch(setPERunning(v)),
    setPreOutputs: (p: any) => dispatch(setPreOutputs(p)),
    setPreTermEnabled: (term: string, enabled: boolean) => dispatch(setPreTermEnabled({ term, enabled })),
    setPreTermEnabledBulk: (map: Record<string, boolean>) => dispatch(setPreTermEnabledBulk(map)),
    setPreDictEnabled: (id: string, enabled: boolean) => dispatch(setPreDictEnabled({ id, enabled })),
    setQAOutputs: (p: any) => dispatch(setQAOutputs(p)),
    setQASyntaxTranslation: (v: string | undefined) => dispatch(setQASyntaxTranslation(v)),
    setQASyntaxEmbedded: (v: string | undefined) => dispatch(setQASyntaxEmbedded(v)),
    setQADislikedPairs: (m: Record<string, boolean> | undefined) => dispatch(setQADislikedPairs(m)),
    setPosteditOutputs: (p: any) => dispatch(setPosteditOutputs(p)),
    setPosteditFinalized: (b: boolean) => dispatch(setPosteditFinalized(b)),
    setAllOutputs: (p: any) => dispatch(setAllOutputs(p)),
  };

  return selector ? selector(api) : api;
}
