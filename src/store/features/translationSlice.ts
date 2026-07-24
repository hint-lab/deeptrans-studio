import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type TranslationStage =
    | 'NOT_STARTED'
    | 'MT'
    | 'MT_REVIEW'
    | 'QA'
    | 'QA_REVIEW'
    | 'POST_EDIT'
    | 'POST_EDIT_REVIEW'
    | 'SIGN_OFF'
    | 'ERROR'
    | 'COMPLETED';

interface TranslationState {
    currentStage: TranslationStage;
    sourceLanguage: string;
    targetLanguage: string;
    contentItemId: string;
    sourceText: string;
    targetText: string;
}

const initialState: TranslationState = {
    currentStage: 'NOT_STARTED',
    sourceLanguage: 'auto',
    targetLanguage: 'auto',
    contentItemId: '',
    sourceText: '',
    targetText: '',
};

export const translationSlice = createSlice({
    name: 'translation',
    initialState,
    reducers: {
        setTranslating: (state, action: PayloadAction<boolean>) => {
            state.currentStage = action.payload ? 'MT' : 'NOT_STARTED';
        },
        setTranslationStage: (state, action: PayloadAction<TranslationStage>) => {
            state.currentStage = action.payload;
        },
        setSourceLanguage: (state, action: PayloadAction<string>) => {
            state.sourceLanguage = action.payload;
        },
        setTargetLanguage: (state, action: PayloadAction<string>) => {
            state.targetLanguage = action.payload;
        },
        clearTranslationContent: state => {
            state.contentItemId = '';
            state.sourceText = '';
            state.targetText = '';
        },
        setTranslationContent: (
            state,
            action: PayloadAction<{ itemId: string; sourceText: string; targetText?: string }>
        ) => {
            state.contentItemId = action.payload.itemId;
            state.sourceText = action.payload.sourceText;
            state.targetText = action.payload.targetText || '';
        },
        setSourceText: (state, action: PayloadAction<string>) => {
            state.sourceText = action.payload;
        },
        setTargetText: (state, action: PayloadAction<string>) => {
            state.targetText = action.payload;
        },
    },
});

export const {
    setTranslationStage,
    setSourceLanguage,
    setTargetLanguage,
    clearTranslationContent,
    setTranslationContent,
    setSourceText,
    setTargetText,
} = translationSlice.actions;

export default translationSlice.reducer;
