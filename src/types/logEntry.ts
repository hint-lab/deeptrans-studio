export interface LogEntry {
    timestamp: string;
    message: string;
    type: 'system' | 'agent' | 'error' | 'warning' | 'info';
}
