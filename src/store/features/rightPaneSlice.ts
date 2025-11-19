import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type RightPanelMode = 'none' | 'chat' | 'preview' | 'help';

interface RightPaneState {
  mode: RightPanelMode;
}

const initialState: RightPaneState = {
  mode: 'none'
};

export const rightPanelSlice = createSlice({
  name: 'rightPane',
  initialState,
  reducers: {
    setRightPanelMode: (state, action: PayloadAction<RightPanelMode>) => {
      state.mode = action.payload;
    },
    toggleChat: (state) => {
      state.mode = state.mode === 'chat' ? 'none' : 'chat';
    },
    togglePreview: (state) => {
      state.mode = state.mode === 'preview' ? 'none' : 'preview';
    },
    toggleHelp: (state) => {
      state.mode = state.mode === 'help' ? 'none' : 'help';
    },
    clearRightPanel: (state) => {
      state.mode = 'none';
    }
  }
});

export const { setRightPanelMode, toggleChat, togglePreview, toggleHelp, clearRightPanel } = rightPanelSlice.actions;
export default rightPanelSlice.reducer;


