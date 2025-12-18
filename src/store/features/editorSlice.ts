import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../index';

interface EditorState {
    editorOpen: boolean;
    sourceEditorId: string | null;
    targetEditorId: string | null;
    sourceContent: string;
    targetContent: string;
}

const initialState: EditorState = {
    editorOpen: false,
    sourceEditorId: null,
    targetEditorId: null,
    sourceContent: '',
    targetContent: '',
};

export const editorSlice = createSlice({
    name: 'editor',
    initialState,
    reducers: {
        setEditorOpen: (state, action: PayloadAction<boolean>) => {
            state.editorOpen = action.payload;
        },
        setSourceEditorId: (state, action: PayloadAction<string | null>) => {
            state.sourceEditorId = action.payload;
        },
        setTargetEditorId: (state, action: PayloadAction<string | null>) => {
            state.targetEditorId = action.payload;
        },
        setSourceContent: (state, action: PayloadAction<string>) => {
            state.sourceContent = action.payload;
        },
        setTargetContent: (state, action: PayloadAction<string>) => {
            state.targetContent = action.payload;
        },
    },
});

export const {
    setEditorOpen,
    setSourceEditorId,
    setTargetEditorId,
    setSourceContent,
    setTargetContent,
} = editorSlice.actions;

// 选择器
export const selectEditorOpen = (state: RootState) => state.editor.editorOpen;
export const selectSourceEditorId = (state: RootState) => state.editor.sourceEditorId;
export const selectTargetEditorId = (state: RootState) => state.editor.targetEditorId;
export const selectSourceContent = (state: RootState) => state.editor.sourceContent;
export const selectTargetContent = (state: RootState) => state.editor.targetContent;

export default editorSlice.reducer;
