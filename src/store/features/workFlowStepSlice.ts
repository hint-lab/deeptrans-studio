import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { PostEditOutcome, PostEditOutcomeByItem } from '@/lib/post-edit-query-outcome';

export type TranslatePhase =
    | 'mono-term-extract'
    | 'dict-lookup'
    | 'term-embed-trans'
    | 'translate'
    | 'all';
export type QAPhase = 'bi-term-eval' | 'syntax-eval' | 'syntex-embed-trans' | 'all';
export type PostEditPhase = 'discourse-query' | 'discourse-eval' | 'discourse-embed-trans' | 'all';

export type PostEditOutputs = {
    /** The only segment allowed to render these otherwise-global fields. */
    itemId: string;
    memos?: any[];
    discourse?: any;
    result?: any;
};

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
    preTranslateItemId?: string;
    preTermEnabled?: Record<string, boolean>;
    preDictEnabled?: Record<string, boolean>;
    // qa data
    qualityAssureItemId?: string;
    qualityAssureBiTerm?: any;
    qualityAssureSyntax?: any;
    qualityAssureSyntaxTranslation?: string;
    qualityAssureSyntaxEmbedded?: string;
    qaDislikedPairs?: Record<string, boolean>;
    // post edit data
    posteditItemId?: string;
    posteditMemos?: any[];
    posteditDiscourse?: any;
    posteditResult?: any;
    /**
     * Outcome is intentionally keyed by document item. A retrieval failure for
     * one segment must never make another segment look empty or unstarted.
     */
    posteditOutcomes: PostEditOutcomeByItem;
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
    preTranslateItemId: undefined,
    preTermEnabled: undefined,
    preDictEnabled: undefined,
    qualityAssureBiTerm: undefined,
    qualityAssureItemId: undefined,
    qualityAssureSyntax: undefined,
    qualityAssureSyntaxTranslation: undefined,
    qualityAssureSyntaxEmbedded: undefined,
    qaDislikedPairs: undefined,
    posteditItemId: undefined,
    posteditMemos: undefined,
    posteditDiscourse: undefined,
    posteditResult: undefined,
    posteditOutcomes: {},
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
            action: PayloadAction<
                { itemId?: string; terms?: any[]; dict?: any[]; translation?: string } | undefined
            >
        ) {
            const partial = action.payload;
            if (!partial) {
                state.preTranslateTerms = undefined;
                state.preTranslateDict = undefined;
                state.preTranslateEmbedded = undefined;
                state.preTranslateItemId = undefined;
                state.preTermEnabled = undefined;
                state.preDictEnabled = undefined;
                return;
            }
            if (partial.itemId && partial.itemId !== state.preTranslateItemId) {
                state.preTranslateTerms = undefined;
                state.preTranslateDict = undefined;
                state.preTranslateEmbedded = undefined;
                state.preTermEnabled = undefined;
                state.preDictEnabled = undefined;
            }
            if (partial.itemId) state.preTranslateItemId = partial.itemId;
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
            action: PayloadAction<{ itemId?: string; biTerm?: any; syntax?: any } | undefined>
        ) {
            const partial = action.payload;
            if (!partial) {
                state.qualityAssureItemId = undefined;
                state.qualityAssureBiTerm = undefined;
                state.qualityAssureSyntax = undefined;
                state.qualityAssureSyntaxEmbedded = undefined;
                state.qaDislikedPairs = undefined;
                return;
            }
            if (partial.itemId && partial.itemId !== state.qualityAssureItemId) {
                state.qualityAssureBiTerm = undefined;
                state.qualityAssureSyntax = undefined;
                state.qualityAssureSyntaxEmbedded = undefined;
                state.qaDislikedPairs = undefined;
            }
            if (partial.itemId) state.qualityAssureItemId = partial.itemId;
            if ('biTerm' in partial) state.qualityAssureBiTerm = partial.biTerm;
            if ('syntax' in partial) state.qualityAssureSyntax = partial.syntax;
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
            action: PayloadAction<PostEditOutputs | undefined>
        ) {
            const partial = action.payload;
            if (!partial) {
                state.posteditItemId = undefined;
                state.posteditMemos = undefined;
                state.posteditDiscourse = undefined;
                state.posteditResult = undefined;
                return;
            }
            if (partial.itemId !== state.posteditItemId) {
                state.posteditMemos = undefined;
                state.posteditDiscourse = undefined;
                state.posteditResult = undefined;
            }
            state.posteditItemId = partial.itemId;
            if ('memos' in partial) state.posteditMemos = partial.memos;
            if ('discourse' in partial) state.posteditDiscourse = partial.discourse;
            if ('result' in partial) state.posteditResult = partial.result;
        },

        setPosteditOutcome(state, action: PayloadAction<PostEditOutcome>) {
            const outcome = action.payload;
            if (!outcome?.itemId) return;
            state.posteditOutcomes[outcome.itemId] = outcome;
        },

        clearPosteditOutcome(state, action: PayloadAction<string>) {
            const itemId = action.payload;
            if (!itemId) return;
            delete state.posteditOutcomes[itemId];
        },

        setPosteditFinalized(state, action: PayloadAction<boolean>) {
            state.finalized = action.payload;
        },
        setAllOutputs(state, action: PayloadAction<any>) {
            state.preTranslateTerms = action.payload.preTranslateTerms;
            state.preTranslateDict = action.payload.preTranslateDict;
            state.preTranslateEmbedded = action.payload.preTranslateEmbedded;
            state.preTranslateItemId = action.payload.preTranslateItemId;
            state.preTermEnabled = action.payload.preTermEnabled;
            state.preDictEnabled = action.payload.preDictEnabled;
            state.qualityAssureBiTerm = action.payload.qualityAssureBiTerm;
            state.qualityAssureItemId = action.payload.qualityAssureItemId;
            state.qualityAssureSyntax = action.payload.qualityAssureSyntax;
            state.qualityAssureSyntaxTranslation = action.payload.qualityAssureSyntaxTranslation;
            state.qualityAssureSyntaxEmbedded = action.payload.qualityAssureSyntaxEmbedded;
            state.qaDislikedPairs = action.payload.qaDislikedPairs;
            state.posteditItemId = action.payload.posteditItemId;
            state.posteditMemos = action.payload.posteditMemos;
            state.posteditDiscourse = action.payload.posteditDiscourse;
            state.posteditResult = action.payload.posteditResult;
            state.posteditOutcomes = action.payload.posteditOutcomes || {};
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
    setPosteditOutcome,
    clearPosteditOutcome,
    setPosteditFinalized,
    setBaselineTranslation,
    setAllOutputs,
} = workFlowStepSlice.actions;

export default workFlowStepSlice.reducer;
