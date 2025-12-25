import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { LogEntry } from '@/types/logEntry';

interface LogState {
    logs: LogEntry[];
}

const STORAGE_KEY = 'app_logs';

// 尝试从 localStorage 加载初始数据
const loadInitialState = (): LogEntry[] => {
    if (typeof window !== 'undefined') {
        try {
            const storedLogs = localStorage.getItem(STORAGE_KEY);
            if (storedLogs) {
                return JSON.parse(storedLogs);
            }
        } catch (error) {
            console.error('加载日志失败:', error);
        }
    }
    return [];
};

const initialState: LogState = {
    logs: loadInitialState(),
};

export const logSlice = createSlice({
    name: 'log',
    initialState,
    reducers: {
        addLog: (state, action: PayloadAction<Omit<LogEntry, 'timestamp'>>) => {
            const logEntry: LogEntry = {
                ...action.payload,
                timestamp: new Date().toISOString(),
            };
            state.logs.push(logEntry);

            // 保存到 localStorage
            if (typeof window !== 'undefined') {
                try {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.logs));
                } catch (error) {
                    console.error('保存日志失败:', error);
                }
            }
        },
        clearLogs: state => {
            state.logs = [];

            // 清除 localStorage
            if (typeof window !== 'undefined') {
                try {
                    localStorage.removeItem(STORAGE_KEY);
                } catch (error) {
                    console.error('清除日志失败:', error);
                }
            }
        },
    },
});

export const { addLog, clearLogs } = logSlice.actions;
export default logSlice.reducer;
