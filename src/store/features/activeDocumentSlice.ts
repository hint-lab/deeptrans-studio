import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { type DocumentTab } from '@/types/explorerTabs';
interface ActiveDocumentState {
    activeDocument: DocumentTab;
}

const initialState: ActiveDocumentState = {
    activeDocument: {
        id: '',
        name: '',
        items: [],
        collapsed: false,
    },
};

export const ActiveDocumentSlice = createSlice({
    name: 'ActiveDocument',
    initialState,
    reducers: {
        setActiveDocumentAction: (state, action: PayloadAction<DocumentTab>) => {
            state.activeDocument = action.payload;
        },
    },
});

export const { setActiveDocumentAction } = ActiveDocumentSlice.actions;
export default ActiveDocumentSlice.reducer;
