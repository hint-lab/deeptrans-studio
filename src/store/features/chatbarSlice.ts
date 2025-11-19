import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { type Message } from '@/types/chat';

interface ChatBarState {
    isOpen: boolean;
    content: Message[];
}

const initialState: ChatBarState = {
    isOpen: false, // 默认侧边栏是关闭的
    content: [], // 默认对话内容为空
};

export const ChatBarContentSlice = createSlice({
    name: 'chatBar',
    initialState,
    reducers: {
        toggle: (state) => {
            state.isOpen = !state.isOpen;
        },
        setContent: (state, action: PayloadAction<Message[]>) => {
            state.content = action.payload;
        },
        appendContent: (state, action: PayloadAction<Message>) => {
            state.content.push(action.payload);
        },
        updateById: (state, action: PayloadAction<{ id: string; message: Omit<Message, 'id'> }>) => {
            const { id, message } = action.payload;
            state.content = state.content.map((m) => (m.id === id ? { ...message, id } : m));
        },
        clearContent: (state) => {
            state.content = [];
        },
    },
});

export const { toggle, setContent, appendContent, updateById, clearContent } = ChatBarContentSlice.actions;
export default ChatBarContentSlice.reducer;
