import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface DialogState {
    isOpen: boolean;
}

const initialState: DialogState = {
    isOpen: false, // 默认侧边栏是关闭的
};

export const DialogSlice = createSlice({
    name: 'Dialog',
    initialState,
    reducers: {
        toggle: state => {
            state.isOpen = !state.isOpen;
        },
    },
});

export const { toggle } = DialogSlice.actions;
export default DialogSlice.reducer;
