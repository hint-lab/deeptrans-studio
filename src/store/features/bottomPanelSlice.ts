import { createSlice } from '@reduxjs/toolkit';

interface BottomPanelState {
    isOpen: boolean;
}

const initialState: BottomPanelState = {
    // Review panels open when a segment reaches a human decision point. Keep
    // the optional workflow/Prompt panel closed while a document is simply
    // being read or prepared for automatic translation.
    isOpen: false,
};

export const bottomPanelSlice = createSlice({
    name: 'bottomPanel',
    initialState,
    reducers: {
        toggle: state => {
            state.isOpen = !state.isOpen;
        },
        setOpen: (state, action: { payload: boolean }) => {
            state.isOpen = action.payload;
        },
    },
});

export const { toggle, setOpen } = bottomPanelSlice.actions;
export default bottomPanelSlice.reducer;
