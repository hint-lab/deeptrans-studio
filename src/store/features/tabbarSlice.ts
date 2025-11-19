import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { type TabBarState } from '@/types/tabBar';

const initialState: TabBarState = {
    tabBars: [],
    activeID: null,
};

export const tabBarSlice = createSlice({
    name: 'tabBar',
    initialState,
    reducers: {
        setTabBarsAction: (state, action: PayloadAction<any[]>) => {
            state.tabBars = action.payload;
        },
        addTabAction: (state, action: PayloadAction<{ id: string; name: string }>) => {
            if (!state.tabBars.some(tab => tab.id === action.payload.id)) {
                state.tabBars.push(action.payload);
            }
        },
        setActiveIDAction: (state, action: PayloadAction<{ id: string; name: string }>) => {
            state.activeID = action.payload;
        },
    },
});

export const { setTabBarsAction, addTabAction, setActiveIDAction } = tabBarSlice.actions;

export default tabBarSlice.reducer;
