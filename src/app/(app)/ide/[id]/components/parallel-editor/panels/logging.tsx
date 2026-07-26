'use client';

import { useState } from 'react';
import { useLogger } from '@/hooks/useLogger';
import { useLocale, useTranslations } from 'next-intl';
import type { LogEntry } from '@/types/logEntry';

type DisplayLogEntry = Omit<LogEntry, 'timestamp'> & {
    timestamp: Date;
};

type LoggingPanelProps = {
    logs?: DisplayLogEntry[];
    onClear?: () => void;
};

export default function LoggingPanel({ logs: propLogs, onClear: propOnClear }: LoggingPanelProps) {
    const t = useTranslations('IDE.logging');
    const locale = useLocale();
    const [filter, setFilter] = useState<'all' | DisplayLogEntry['type']>('all');
    const { getLogsForUI, clearAllLogs } = useLogger();

    const reduxLogs = getLogsForUI();
    const displayLogs = propLogs ?? reduxLogs;

    // 处理清除日志
    const handleClearLogs = () => {
        if (propOnClear) {
            propOnClear();
        } else {
            clearAllLogs();
        }
    };

    const filteredLogs = displayLogs.filter(log => {
        if (filter === 'all') return true;
        return log.type === filter;
    });

    // 日志类型对应的样式
    const logTypeStyles = {
        system: 'text-blue-500',
        agent: 'text-green-500',
        error: 'text-red-500',
        warning: 'text-yellow-500',
        info: 'text-gray-500',
    };

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString(locale, {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        });
    };

    return (
        <div className="flex h-full flex-col bg-background text-foreground">
            {/* 工具栏 */}
            <div className="flex items-center border-b px-3 py-1">
                <select
                    className="mr-2 rounded border border-gray-300 bg-transparent px-1 py-0.5 text-xs dark:border-gray-700"
                    value={filter}
                    onChange={e => setFilter(e.target.value as typeof filter)}
                >
                    <option value="all">{t('filters.all')}</option>
                    <option value="system">{t('filters.system')}</option>
                    <option value="agent">{t('filters.translation')}</option>
                    <option value="error">{t('filters.error')}</option>
                    <option value="warning">{t('filters.warning')}</option>
                    <option value="info">{t('filters.info')}</option>
                </select>
                <button
                    className="rounded bg-muted px-2 py-0.5 text-xs hover:bg-muted/80"
                    onClick={handleClearLogs}
                >
                    {t('clear')}
                </button>
            </div>

            {/* 日志内容 */}
            <div className="flex-1 overflow-auto p-2 font-mono text-xs">
                {filteredLogs.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-gray-400">
                        {t('noLogs')}
                    </div>
                ) : (
                    filteredLogs.map((log, index) => (
                        <div key={index} className="flex border-b border-muted/20 py-1">
                            <span className="mr-2 text-gray-400">{formatTime(log.timestamp)}</span>
                            <span className={`${logTypeStyles[log.type]} mr-2`}>
                                [
                                {log.type === 'agent'
                                    ? t('types.agent')
                                    : log.type === 'system'
                                      ? t('types.system')
                                      : log.type === 'error'
                                        ? t('types.error')
                                        : log.type === 'warning'
                                          ? t('types.warning')
                                          : t('types.info')}
                                ]
                            </span>
                            <span>{log.message}</span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
