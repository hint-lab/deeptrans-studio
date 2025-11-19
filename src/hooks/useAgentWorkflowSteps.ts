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
  setAllOutputs,
  TranslatePhase,
  QAPhase,
  PostEditPhase
} from '@/store/features/workFlowStepSlice';

type WorkflowAPI = {
  setBaselineTranslation: (v: string | undefined) => void;
  setPreStep: (v: "done" | TranslatePhase | "idle") => void;
  setQAStep: (v: "done" | "idle" | QAPhase) => void;
  setPeStep: (v: "done" | "idle" | PostEditPhase) => void;
  setPreRunning: (v: boolean) => void;
  setQARunning: (v: boolean) => void;
  setPERunning: (v: boolean) => void;
  setPreOutputs: (p: any) => void;
  setPreTermEnabled: (term: string, enabled: boolean) => void;
  setPreTermEnabledBulk: (map: Record<string, boolean>) => void;
  setPreDictEnabled: (id: string, enabled: boolean) => void;
  setQAOutputs: (p: any) => void;
  setQASyntaxTranslation: (v: string | undefined) => void;
  setQASyntaxEmbedded: (v: string | undefined) => void;
  setQADislikedPairs: (m: Record<string, boolean> | undefined) => void;
  setPosteditOutputs: (p: any) => void;
  setPosteditFinalized: (b: boolean) => void;
  setAllOutputs: (p: any) => void;
  [key: string]: any;
};

// 兼容旧用法：useAgentWorkflowSteps(selector?)
export function useAgentWorkflowSteps(): WorkflowAPI;
export function useAgentWorkflowSteps<T>(selector: (s: WorkflowAPI) => T): T;
export function useAgentWorkflowSteps<T>(selector?: (s: WorkflowAPI) => T): T | WorkflowAPI {
  const dispatch = useAppDispatch();
  const state = useAppSelector((s) => (s as any).workFlowStep || {});

  const api: WorkflowAPI = {
    ...state,
    setBaselineTranslation: (v: string | undefined) => dispatch(setBaselineTranslation(v)),
    setPreStep: (v: "done" | TranslatePhase | "idle") => dispatch(setPreStep(v)),
    setQAStep: (v: "done" | "idle" | QAPhase) => dispatch(setQAStep(v)),
    setPeStep: (v: "done" | "idle" | PostEditPhase) => dispatch(setPeStep(v)),
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
