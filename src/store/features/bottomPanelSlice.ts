import { createSlice } from '@reduxjs/toolkit';

interface BottomPanelState {
    isOpen: boolean;
}

const initialState: BottomPanelState = {
    // The translation workbench is part of the editor, not an optional status
    // card. Keep it visible by default; users can still close it explicitly.
    isOpen: true,
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
