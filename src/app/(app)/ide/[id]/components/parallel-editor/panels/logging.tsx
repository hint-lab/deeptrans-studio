"use client";

import { useState } from 'react';
import { useLogger } from '@/hooks/useLogger';
import { useTranslations } from 'next-intl';

type LogEntry = {
    type: 'system' | 'agent' | 'error' | 'warning' | 'info';
    message: string;
    timestamp: Date;
};

type LoggingPanelProps = {
    logs?: LogEntry[];
    onClear?: () => void;
};

export default function LoggingPanel({
    logs: propLogs,
    onClear: propOnClear
}: LoggingPanelProps) {
    const t = useTranslations('IDE.logging');
    const [filter, setFilter] = useState<string>('all');
    const { getLogsForUI, clearAllLogs } = useLogger();

    // 如果没有提供logs，使用默认的演示日志
    const [demoLogs] = useState<LogEntry[]>([
        { type: 'system', message: t('demo.workflowInit'), timestamp: new Date() },
        { type: 'agent', message: t('demo.documentLoaded'), timestamp: new Date() },
        { type: 'system', message: t('demo.engineReady'), timestamp: new Date() },
        { type: 'agent', message: t('demo.processing'), timestamp: new Date() },
        { type: 'warning', message: t('demo.unknownFormat'), timestamp: new Date() },
        { type: 'agent', message: t('demo.progress10'), timestamp: new Date() },
        { type: 'info', message: t('demo.neuralTranslation'), timestamp: new Date() },
        { type: 'agent', message: t('demo.progress25'), timestamp: new Date() },
        { type: 'error', message: t('demo.parseError'), timestamp: new Date() },
        { type: 'agent', message: t('demo.skipError'), timestamp: new Date() },
        { type: 'agent', message: t('demo.progress50'), timestamp: new Date() },
        { type: 'agent', message: t('demo.progress75'), timestamp: new Date() },
        { type: 'system', message: t('demo.optimizing'), timestamp: new Date() },
        { type: 'agent', message: t('demo.completed'), timestamp: new Date() },
        { type: 'system', message: t('demo.generating'), timestamp: new Date() },
        { type: 'info', message: t('demo.saved'), timestamp: new Date() },
    ]);

    // 使用 Redux 中的日志或者传入的日志，如果都没有则使用演示日志
    const reduxLogs = getLogsForUI();
    const displayLogs = propLogs?.length ? propLogs : reduxLogs.length ? reduxLogs : demoLogs;

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
        return date.toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    };

    return (
        <div className="flex flex-col h-full bg-background text-foreground">
            {/* 工具栏 */}
            <div className="flex items-center px-3 py-1 border-b">
                <select
                    className="text-xs bg-transparent border border-gray-300 dark:border-gray-700 rounded px-1 py-0.5 mr-2"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                >
                    <option value="all">{t('filters.all')}</option>
                    <option value="system">{t('filters.system')}</option>
                    <option value="translation">{t('filters.translation')}</option>
                    <option value="error">{t('filters.error')}</option>
                    <option value="warning">{t('filters.warning')}</option>
                    <option value="info">{t('filters.info')}</option>
                </select>
                <button
                    className="text-xs px-2 py-0.5 bg-muted hover:bg-muted/80 rounded"
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
                        <div key={index} className="py-1 border-b border-muted/20 flex">
                            <span className="text-gray-400 mr-2">{formatTime(log.timestamp)}</span>
                            <span className={`${logTypeStyles[log.type]} mr-2`}>
                                [{log.type === 'agent' ? t('types.agent') :
                                    log.type === 'system' ? t('types.system') :
                                        log.type === 'error' ? t('types.error') :
                                            log.type === 'warning' ? t('types.warning') : t('types.info')}]
                            </span>
                            <span>{log.message}</span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
} 