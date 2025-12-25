import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type TranslatePhase =
    | 'mono-term-extract'
    | 'dict-lookup'
    | 'term-embed-trans'
    | 'translate'
    | 'all';
export type QAPhase = 'bi-term-eval' | 'syntax-eval' | 'syntex-embed-trans' | 'all';
export type PostEditPhase = 'discourse-query' | 'discourse-eval' | 'discourse-embed-trans' | 'all';

export interface WorkflowState {
    baselineTranslation?: string;
    // translate / QA / PostEdit steps
    preStep: TranslatePhase | 'idle' | 'done';
    qaStep: QAPhase | 'idle' | 'done';
    peStep: PostEditPhase | 'idle' | 'done';
    // running flags
    isPreRunning: boolean;
    isQARunning: boolean;
    isPERunning: boolean;
    // translate data
    preTranslateTerms?: any[];
    preTranslateDict?: any[];
    preTranslateEmbedded?: string;
    preTermEnabled?: Record<string, boolean>;
    preDictEnabled?: Record<string, boolean>;
    // qa data
    qualityAssureBiTerm?: any;
    qualityAssureSyntax?: any;
    qualityAssureSyntaxTranslation?: string;
    qualityAssureSyntaxEmbedded?: string;
    qaDislikedPairs?: Record<string, boolean>;
    // post edit data
    posteditMemos?: any[];
    posteditDiscourse?: any;
    posteditResult?: any;
    // final persisted flags (optional)
    finalized?: boolean;
}

const initialState: WorkflowState = {
    baselineTranslation: undefined,
    preStep: 'idle',
    qaStep: 'idle',
    peStep: 'idle',
    isPreRunning: false,
    isQARunning: false,
    isPERunning: false,
    preTranslateTerms: undefined,
    preTranslateDict: undefined,
    preTranslateEmbedded: undefined,
    preTermEnabled: undefined,
    preDictEnabled: undefined,
    qualityAssureBiTerm: undefined,
    qualityAssureSyntax: undefined,
    qualityAssureSyntaxTranslation: undefined,
    qualityAssureSyntaxEmbedded: undefined,
    qaDislikedPairs: undefined,
    posteditMemos: undefined,
    posteditDiscourse: undefined,
    posteditResult: undefined,
    finalized: false,
};

export const workFlowStepSlice = createSlice({
    name: 'workflowSteps',
    initialState,
    reducers: {
        setBaselineTranslation(state, action: PayloadAction<string | undefined>) {
            state.baselineTranslation = action.payload;
        },
        setPreStep(state, action: PayloadAction<WorkflowState['preStep']>) {
            state.preStep = action.payload;
        },
        setQAStep(state, action: PayloadAction<WorkflowState['qaStep']>) {
            state.qaStep = action.payload;
        },
        setPeStep(state, action: PayloadAction<WorkflowState['peStep']>) {
            state.peStep = action.payload;
        },
        setPreRunning(state, action: PayloadAction<boolean>) {
            state.isPreRunning = action.payload;
        },
        setQARunning(state, action: PayloadAction<boolean>) {
            state.isQARunning = action.payload;
        },
        setPERunning(state, action: PayloadAction<boolean>) {
            state.isPERunning = action.payload;
        },

        setPreOutputs(
            state,
            action: PayloadAction<{ terms?: any[]; dict?: any[]; translation?: string } | undefined>
        ) {
            const partial = action.payload;
            if (!partial) {
                state.preTranslateTerms = undefined;
                state.preTranslateDict = undefined;
                state.preTranslateEmbedded = undefined;
                state.preTermEnabled = undefined;
                state.preDictEnabled = undefined;
                return;
            }
            if (partial.terms !== undefined) state.preTranslateTerms = partial.terms;
            if (partial.dict !== undefined) state.preTranslateDict = partial.dict;
            if (partial.translation !== undefined) state.preTranslateEmbedded = partial.translation;
            if (partial.terms !== undefined) {
                const prevMap = state.preTermEnabled || {};
                const list = Array.isArray(partial.terms) ? partial.terms : [];
                const nextMap: Record<string, boolean> = {};
                for (const t of list as any[]) {
                    const key =
                        typeof t === 'string'
                            ? t
                            : String((t as any)?.term ?? (t as any)?.source ?? '');
                    if (!key) continue;
                    nextMap[key] = prevMap[key] !== undefined ? prevMap[key] : true;
                }
                state.preTermEnabled = nextMap;
            }
        },

        setPreTermEnabled(state, action: PayloadAction<{ term: string; enabled: boolean }>) {
            const { term, enabled } = action.payload;
            const prev = state.preTermEnabled || {};
            state.preTermEnabled = { ...prev, [term]: enabled };
        },
        setPreTermEnabledBulk(state, action: PayloadAction<Record<string, boolean>>) {
            state.preTermEnabled = { ...(state.preTermEnabled || {}), ...action.payload };
        },
        setPreDictEnabled(state, action: PayloadAction<{ id: string; enabled: boolean }>) {
            const { id, enabled } = action.payload;
            const prev = state.preDictEnabled || {};
            state.preDictEnabled = { ...prev, [id]: enabled };
        },

        setQAOutputs(
            state,
            action: PayloadAction<{ biTerm?: any; syntax?: any; discourse?: any } | undefined>
        ) {
            const partial = action.payload;
            if (!partial) {
                state.qualityAssureBiTerm = undefined;
                state.qualityAssureSyntax = undefined;
                state.posteditDiscourse = undefined;
                return;
            }
            if ('biTerm' in partial) state.qualityAssureBiTerm = partial.biTerm;
            if ('syntax' in partial) state.qualityAssureSyntax = partial.syntax;
            if ('discourse' in partial) state.posteditDiscourse = partial.discourse;
        },
        setQASyntaxTranslation(state, action: PayloadAction<string | undefined>) {
            state.qualityAssureSyntaxTranslation = action.payload;
        },

        setQASyntaxEmbedded(state, action: PayloadAction<string | undefined>) {
            state.qualityAssureSyntaxEmbedded = action.payload;
        },

        setQADislikedPairs(state, action: PayloadAction<Record<string, boolean> | undefined>) {
            state.qaDislikedPairs = action.payload;
        },

        setPosteditOutputs(
            state,
            action: PayloadAction<{ memos?: any[]; discourse?: any; result?: any } | undefined>
        ) {
            const partial = action.payload;
            if (!partial) {
                state.posteditMemos = undefined;
                state.posteditDiscourse = undefined;
                state.posteditResult = undefined;
                return;
            }
            if ('memos' in partial) state.posteditMemos = partial.memos;
            if ('discourse' in partial) state.posteditDiscourse = partial.discourse;
            if ('result' in partial) state.posteditResult = partial.result;
        },

        setPosteditFinalized(state, action: PayloadAction<boolean>) {
            state.finalized = action.payload;
        },
        setAllOutputs(state, action: PayloadAction<any>) {
            state.preTranslateTerms = action.payload.preTranslateTerms;
            state.preTranslateDict = action.payload.preTranslateDict;
            state.preTranslateEmbedded = action.payload.preTranslateEmbedded;
            state.preTermEnabled = action.payload.preTermEnabled;
            state.preDictEnabled = action.payload.preDictEnabled;
            state.qualityAssureBiTerm = action.payload.qualityAssureBiTerm;
            state.qualityAssureSyntax = action.payload.qualityAssureSyntax;
            state.qualityAssureSyntaxTranslation = action.payload.qualityAssureSyntaxTranslation;
            state.qualityAssureSyntaxEmbedded = action.payload.qualityAssureSyntaxEmbedded;
            state.qaDislikedPairs = action.payload.qaDislikedPairs;
            state.posteditMemos = action.payload.posteditMemos;
            state.posteditDiscourse = action.payload.posteditDiscourse;
            state.posteditResult = action.payload.posteditResult;
            state.finalized = action.payload.finalized;
        },
    },
});

export const {
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
} = workFlowStepSlice.actions;

export default workFlowStepSlice.reducer;
