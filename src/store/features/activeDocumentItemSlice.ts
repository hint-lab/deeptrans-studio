import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { type DocumentItemTab } from '@/types/explorerTabs';
interface ActiveDocumentItemState {
    activeDocumentItem: DocumentItemTab;
}

const initialState: ActiveDocumentItemState = {
    activeDocumentItem: {
        id: '',
        name: '',
        status: 'NOT_STARTED',
    },
};

export const ActiveDocumentItemSlice = createSlice({
    name: 'ActiveDocumentItem',
    initialState,
    reducers: {
        setActiveDocumentItemAction: (state, action: PayloadAction<DocumentItemTab>) => {
            state.activeDocumentItem = action.payload;
        },
    },
});

export const { setActiveDocumentItemAction } = ActiveDocumentItemSlice.actions;
export default ActiveDocumentItemSlice.reducer;
