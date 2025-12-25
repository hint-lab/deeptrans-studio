import { createSlice } from '@reduxjs/toolkit';

interface SidebarState {
    isOpen: boolean;
}

const initialState: SidebarState = {
    isOpen: true, // 默认侧边栏是打开的
};

export const sidebarSlice = createSlice({
    name: 'sidebar',
    initialState,
    reducers: {
        toggle: state => {
            state.isOpen = !state.isOpen;
        },
    },
});

export const { toggle } = sidebarSlice.actions;
export default sidebarSlice.reducer;
