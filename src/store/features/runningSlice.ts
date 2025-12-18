import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface RunningState {
    isRunning: boolean;
    errorMessage: string;
}

const initialState: RunningState = {
    isRunning: false,
    errorMessage: '',
};

export const runningSlice = createSlice({
    name: 'running',
    initialState,
    reducers: {
        setRunning: (state, action: PayloadAction<boolean>) => {
            state.isRunning = action.payload;
        },
        setErrorMessage: (state, action: PayloadAction<string>) => {
            state.errorMessage = action.payload;
        },
    },
});

export const { setRunning, setErrorMessage } = runningSlice.actions;

export default runningSlice.reducer;
