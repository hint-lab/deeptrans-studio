interface LogEntry {
    timestamp: string;
    content: string;
    type?: 'info' | 'warning' | 'error';
}

class LogManager {
    private static instance: LogManager;
    private readonly STORAGE_KEY = 'app_logs';
    private logs: LogEntry[] = [];

    private constructor() {
        this.loadLogs();
    }

    public static getInstance(): LogManager {
        if (!LogManager.instance) {
            LogManager.instance = new LogManager();
        }
        return LogManager.instance;
    }

    private loadLogs(): void {
        try {
            const storedLogs = localStorage.getItem(this.STORAGE_KEY);
            if (storedLogs) {
                this.logs = JSON.parse(storedLogs);
            }
        } catch (error) {
            console.error('加载日志失败:', error);
        }
    }

    private saveLogs(): void {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.logs));
        } catch (error) {
            console.error('保存日志失败:', error);
        }
    }

    public addLog(content: string, type: 'info' | 'warning' | 'error' = 'info'): void {
        const logEntry: LogEntry = {
            timestamp: new Date().toISOString(),
            content,
            type,
        };
        this.logs.push(logEntry);
        this.saveLogs();
    }

    public getLogs(): LogEntry[] {
        return [...this.logs];
    }

    public clearLogs(): void {
        this.logs = [];
        this.saveLogs();
    }

    public getLogsByType(type: 'info' | 'warning' | 'error'): LogEntry[] {
        return this.logs.filter(log => log.type === type);
    }

    public getRecentLogs(count: number = 10): LogEntry[] {
        return this.logs.slice(-count);
    }
}

export const logManager = LogManager.getInstance();
