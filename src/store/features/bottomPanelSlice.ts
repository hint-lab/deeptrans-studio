import { createSlice } from '@reduxjs/toolkit';

interface BottomPanelState {
    isOpen: boolean;
}

const initialState: BottomPanelState = {
    isOpen: true, // 默认面板开启
};

export const bottomPanelSlice = createSlice({
    name: 'bottomPanel',
    initialState,
    reducers: {
        toggle: (state) => {
            state.isOpen = !state.isOpen;
        },
    },
});

export const { toggle } = bottomPanelSlice.actions;
export default bottomPanelSlice.reducer;
