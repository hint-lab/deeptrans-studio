import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface LanguageState {
    sourceLanguage: string;
    targetLanguage: string;
}

const initialState: LanguageState = {
    sourceLanguage: 'zh',
    targetLanguage: 'en',
};

export const LanguageSlice = createSlice({
    name: 'Language',
    initialState,
    reducers: {
        setSourceLanguageAction: (state, action: PayloadAction<string>) => {
            state.sourceLanguage = action.payload;
        },
        setTargetLanguageAction: (state, action: PayloadAction<string>) => {
            state.targetLanguage = action.payload;
        },
    },
});

export const { setSourceLanguageAction, setTargetLanguageAction } = LanguageSlice.actions;
export default LanguageSlice.reducer;
