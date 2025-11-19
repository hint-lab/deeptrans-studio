import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type TranslationStage = 'NOT_STARTED' | 'MT' | 'MT_REVIEW' | 'QA' |  'QA_REVIEW'  | 'POST_EDIT' | 'POST_EDIT_REVIEW' | 'SIGN_OFF' | 'ERROR' | 'COMPLETED';

interface TranslationState {
    currentStage: TranslationStage;
    sourceLanguage: string;
    targetLanguage: string;
    sourceText: string;
    targetText: string;
}

const initialState: TranslationState = {
    currentStage: 'NOT_STARTED',
    sourceLanguage: 'auto',
    targetLanguage: 'auto',
    sourceText: '',
    targetText: ''
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
        setSourceText: (state, action: PayloadAction<string>) => {
            state.sourceText = action.payload;
        },
        setTargetText: (state, action: PayloadAction<string>) => {
            state.targetText = action.payload;
        }
    }
});

export const {
    setTranslationStage,
    setSourceLanguage,
    setTargetLanguage,
    setSourceText,
    setTargetText
} = translationSlice.actions;

export default translationSlice.reducer; 