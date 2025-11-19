'use client';

import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { addLog, clearLogs } from '@/store/features/logSlice';
import { LogEntry } from '@/types/logEntry';

export const useLogger = () => {
    const dispatch = useAppDispatch();
    const logs = useAppSelector((state) => (state.log as { logs: LogEntry[] })?.logs ?? []);

    const logInfo = (message: string) => {
        dispatch(addLog({ message, type: 'info' }));
    };

    const logWarning = (message: string) => {
        dispatch(addLog({ message, type: 'warning' }));
    };

    const logError = (message: string) => {
        dispatch(addLog({ message, type: 'error' }));
    };

    const logSystem = (message: string) => {
        dispatch(addLog({ message, type: 'system' }));
    };

    const logAgent = (message: string) => {
        dispatch(addLog({ message, type: 'agent' }));
    };

    const clearAllLogs = () => {
        dispatch(clearLogs());
    };

    const getRecentLogs = (count: number = 10) => {
        return logs.slice(-count);
    };

    const getLogsByType = (type: 'system' | 'translation' | 'error' | 'warning' | 'info') => {
        return logs.filter(log => log.type === type);
    };

    // 将存储的日志转换为UI所需格式
    const getLogsForUI = () => {
        return logs.map(log => ({
            ...log,
            timestamp: new Date(log.timestamp)
        }));
    };

    return {
        logs,
        logInfo,
        logWarning,
        logError,
        logSystem,
        logAgent,
        clearAllLogs,
        getRecentLogs,
        getLogsByType,
        getLogsForUI
    };
}; 