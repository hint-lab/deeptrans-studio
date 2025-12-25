// lib/json-logger.ts
type PinoLogMethod = (...args: any[]) => void;
interface LogEntry {
    level: string;
    timestamp: string;
    message: string;
    [key: string]: any;
}

interface LoggerContext {
    [key: string]: any;
}

interface LoggerOptions {
    json?: boolean;        // 是否输出 JSON 格式
    pretty?: boolean;      // 是否美化输出（仅 JSON 模式）
    colors?: boolean;      // 是否使用颜色（仅文本模式）
    includeCaller?: boolean; // 是否包含调用者信息
}

class JsonLogger {
    private context: LoggerContext = {};
    private options: LoggerOptions;

    // 预绑定的方法
    private readonly boundLog: (...args: any[]) => LogEntry;
    private readonly boundInfo: (...args: any[]) => LogEntry;
    private readonly boundWarn: (...args: any[]) => LogEntry;
    private readonly boundError: (...args: any[]) => LogEntry;
    private readonly boundDebug: (...args: any[]) => LogEntry;
    constructor(context: LoggerContext = {}, options: LoggerOptions = {}) {
        this.context = context;
        this.options = {
            json: true,           // 默认 JSON 格式
            pretty: process.env.NODE_ENV !== 'production',  // 开发环境美化
            colors: false,        // JSON 模式下不使用颜色
            includeCaller: true,  // 默认包含调用者信息
            ...options,
        };
        // 绑定方法
        this.boundLog = this.log.bind(this);
        this.boundInfo = this.info.bind(this);
        this.boundWarn = this.warn.bind(this);
        this.boundError = this.error.bind(this);
        this.boundDebug = this.debug.bind(this);
    }

    /**
     * 创建具有上下文的子 Logger
     */
    static createLogger(context: LoggerContext, options?: LoggerOptions): JsonLogger {
        return new JsonLogger(context, options);
    }

    /**
     * 创建请求上下文 Logger
     */
    static createRequestLogger(options?: {
        userAgent?: string;
        ip?: string;
        method?: string;
        path?: string;
        referer?: string;
        requestId?: string;
        [key: string]: any;
    }, loggerOptions?: LoggerOptions): JsonLogger {
        const context = {
            ...options,
            type: 'request',
            hostname: typeof process !== 'undefined'
                ? process.env.HOSTNAME || 'localhost'
                : 'edge-runtime',
            runtime: typeof process !== 'undefined' ? 'node' : 'edge',
            timestamp: new Date().toLocaleString(),
        };

        return new JsonLogger(context, loggerOptions);
    }

    /**
     * 创建具有新上下文的子 Logger
     */
    child(additionalContext: LoggerContext): JsonLogger {
        return new JsonLogger({
            ...this.context,
            ...additionalContext,
        }, this.options);
    }

    /**
     * 设置选项
     */
    withOptions(options: Partial<LoggerOptions>): JsonLogger {
        return new JsonLogger(this.context, {
            ...this.options,
            ...options,
        });
    }

    private getCallerInfo() {
        if (!this.options.includeCaller) {
            return { fileName: '', line: '', column: '' };
        }

        const error = new Error();
        const stack = error.stack?.split('\n') || [];

        // 获取调用栈信息
        const callerLine = stack[4] || stack[3] || '';

        // 提取文件和行号
        const match = callerLine.match(/\((.*):(\d+):(\d+)\)/) ||
            callerLine.match(/at\s+(.*):(\d+):(\d+)/);

        if (match) {
            const [, filePath, line, column] = match;
            const fileName = filePath ? filePath.split('/').pop() : '';
            return { fileName, line, column };
        }

        return { fileName: '', line: '', column: '' };
    }

    private formatLogEntry(level: string, input: any): LogEntry {
        const now = new Date();
        const timestamp = now.toLocaleString();

        const caller = this.getCallerInfo();
        const callerInfo = caller.fileName ? `${caller.fileName}:${caller.line}` : '';

        // 构建基础日志条目
        const logEntry: LogEntry = {
            level: level.toUpperCase(),
            timestamp,
            message: '',
            ...this.context,
        };

        // 添加调用者信息
        if (callerInfo) {
            logEntry.caller = callerInfo;
        }

        // 处理输入参数
        if (typeof input === 'string') {
            // 如果是字符串，作为 message
            logEntry.message = input;
        } else if (typeof input === 'object' && input !== null) {
            // 如果是对象，合并到日志条目
            if (input.message) {
                logEntry.message = input.message;
                delete input.message;
            } else if (input.msg) {
                logEntry.message = input.msg;
                delete input.msg;
            } else if (input.error?.message) {
                // 如果有 error 对象，使用 error.message
                logEntry.message = input.error.message;
            }

            // 合并其他字段
            Object.keys(input).forEach(key => {
                if (!['level', 'timestamp', 'message', 'msg'].includes(key)) {
                    logEntry[key] = input[key];
                }
            });
        }

        // 确保有 message 字段
        if (!logEntry.message) {
            logEntry.message = '';
        }

        return logEntry;
    }

    private outputLog(level: string, logEntry: LogEntry) {
        if (this.options.json) {
            // JSON 格式输出
            const output = this.options.pretty
                ? JSON.stringify(logEntry, null, 2)
                : JSON.stringify(logEntry);

            this.writeToConsole(level, output);
        } else {
            // 文本格式输出（带颜色）
            this.outputTextFormat(level, logEntry);
        }
    }

    private outputTextFormat(level: string, logEntry: LogEntry) {
        const colors = {
            reset: '\x1b[0m',
            timestamp: '\x1b[90m',
            caller: '\x1b[36m',
            level: {
                LOG: '\x1b[37m',
                INFO: '\x1b[32m',
                WARN: '\x1b[33m',
                ERROR: '\x1b[31m',
                DEBUG: '\x1b[35m',
            },
        };

        const { timestamp, caller, message, ...rest } = logEntry;
        const levelColor = colors.level[logEntry.level as keyof typeof colors.level] || colors.level.LOG;

        // 基础信息
        let formatted = `${colors.timestamp}${timestamp}${colors.reset} `;
        if (caller) {
            formatted += `${colors.caller}[${caller}]${colors.reset} `;
        }
        formatted += `${levelColor}[${logEntry.level}]${colors.reset} ${message}`;

        // 添加上下文数据
        const contextKeys = Object.keys(rest).filter(key =>
            !['type', 'hostname', 'runtime', 'timestamp'].includes(key)
        );

        if (contextKeys.length > 0) {
            formatted += ' ' + contextKeys.map(key => {
                const value = rest[key];
                let valueStr: string;

                if (value === null) valueStr = 'null';
                else if (value === undefined) valueStr = 'undefined';
                else if (typeof value === 'object') {
                    try {
                        valueStr = JSON.stringify(value);
                    } catch {
                        valueStr = String(value);
                    }
                } else {
                    valueStr = String(value);
                }

                return `${key}=${valueStr}`;
            }).join(' ');
        }

        this.writeToConsole(level, formatted);
    }

    private writeToConsole(level: string, message: string) {
        switch (level.toLowerCase()) {
            case 'info':
                console.info(message);
                break;
            case 'warn':
                console.warn(message);
                break;
            case 'error':
                console.error(message);
                break;
            case 'debug':
                if (process.env.NODE_ENV !== 'production') {
                    console.debug(message);
                }
                break;
            default:
                console.log(message);
        }
    }

    /**
     * 统一日志方法
     */
    private logWithLevel(level: string, ...args: any[]): LogEntry {
        // 合并所有参数
        let logData: any = {};

        if (args.length === 1) {
            // 单个参数
            if (typeof args[0] === 'string') {
                logData.message = args[0];
            } else if (typeof args[0] === 'object' && args[0] !== null) {
                logData = args[0];

                // 特殊处理 Error 对象
                if (args[0] instanceof Error) {
                    const error = args[0];
                    logData = {
                        message: error.message,
                        error: {
                            name: error.name,
                            message: error.message,
                            stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
                        }
                    };
                }
            }
        } else if (args.length === 2) {
            // 两个参数：通常是 (message, data)
            if (typeof args[0] === 'string' && typeof args[1] === 'object' && args[1] !== null) {
                logData = { ...args[1], message: args[0] };
            } else {
                // 其他情况合并为字符串
                logData.message = args.map(arg =>
                    typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
                ).join(' ');
            }
        } else if (args.length > 2) {
            // 多个参数：合并成字符串消息
            logData.message = args.map(arg =>
                typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
            ).join(' ');
        }

        // 格式化日志条目
        const logEntry = this.formatLogEntry(level, logData);

        // 输出日志
        this.outputLog(level, logEntry);

        // 如果是 error 级别且包含 Error 对象，输出堆栈
        if (level === 'error') {
            const error = args.find(arg => arg instanceof Error);
            if (error?.stack && process.env.NODE_ENV !== 'production') {
                console.error('\x1b[31m%s\x1b[0m', error.stack);
            }
        }

        return logEntry;
    }

    /**
     * 公共日志方法
     */
    log(...args: any[]): LogEntry {
        return this.logWithLevel('log', ...args);
    }

    info(...args: any[]): LogEntry {
        return this.logWithLevel('info', ...args);
    }

    warn(...args: any[]): LogEntry {
        return this.logWithLevel('warn', ...args);
    }

    error(...args: any[]): LogEntry {
        return this.logWithLevel('error', ...args);
    }

    debug(...args: any[]): LogEntry {
        if (process.env.NODE_ENV !== 'production') {
            return this.logWithLevel('debug', ...args);
        }
        return {} as LogEntry;
    }

    /**
     * JSON 专用方法
     */
    json(data: any): void {
        const output = this.options.pretty
            ? JSON.stringify(data, null, 2)
            : JSON.stringify(data);
        console.log(output);
    }

    /**
     * 专门的请求日志方法
     */
    logRequestStart(additionalData?: Record<string, any>): LogEntry {
        return this.info({
            message: 'Request started',
            event: 'request_start',
            timestamp: new Date().toLocaleString(),
            ...additionalData,
        });
    }

    logRequestEnd(statusCode: number, responseTime: number, additionalData?: Record<string, any>): LogEntry {
        const level = statusCode >= 500 ? 'error' :
            statusCode >= 400 ? 'warn' : 'info';

        const data = {
            message: 'Request completed',
            event: 'request_end',
            statusCode,
            responseTime,
            timestamp: new Date().toLocaleString(),
            ...additionalData,
        };
        // 使用预绑定的方法
        const levelMethods = {
            error: this.boundError,
            warn: this.boundWarn,
            info: this.boundInfo,
            log: this.boundLog,
            debug: this.boundDebug,
        };

        return levelMethods[level](data);
    }

    logRequestError(error: Error, additionalData?: Record<string, any>): LogEntry {
        return this.error({
            message: 'Request error',
            event: 'request_error',
            error: {
                name: error.name,
                message: error.message,
                stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
            },
            timestamp: new Date().toLocaleString(),
            ...additionalData,
        });
    }
}

/**
 * 创建 HTTP 请求日志中间件
 */
export const createRequestLoggerMiddleware = (options?: LoggerOptions) => {
    return (req: any, res: any, next: PinoLogMethod) => {
        const startTime = Date.now();

        // 创建请求特定的 logger
        const requestLogger = JsonLogger.createRequestLogger({
            method: req.method,
            path: req.path,
            url: req.originalUrl || req.url,
            ip: req.ip || req.connection?.remoteAddress || 'unknown',
            userAgent: req.get?.('user-agent') || req.headers['user-agent'],
            referer: req.get?.('referer') || req.headers['referer'],
            hostname: req.hostname || 'localhost',
            requestId: req.headers['x-request-id'] ||
                req.id ||
                `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        }, options);

        // 挂载到 request 对象
        (req as any).logger = requestLogger;

        // 记录请求开始
        requestLogger.logRequestStart({
            query: req.query,
            bodySize: req.body ? JSON.stringify(req.body).length : 0,
        });

        // 响应完成时记录
        const originalEnd = res.end;
        res.end = function (...args: any[]) {
            const responseTime = Date.now() - startTime;

            // 记录请求结束
            requestLogger.logRequestEnd(
                res.statusCode,
                responseTime,
                {
                    contentLength: res.get?.('content-length'),
                    user: req.user?.id ? { id: req.user.id } : undefined,
                }
            );

            return originalEnd.apply(this, args);
        };

        // 错误处理
        res.on('error', (error: Error) => {
            requestLogger.logRequestError(error);
        });

        next();
    };
};

// 导出默认配置的单例
export const createDefaultLogger = (context?: LoggerContext) => {
    return new JsonLogger(context, {
        json: true,
        pretty: process.env.NODE_ENV !== 'production',
        colors: false,
        includeCaller: true,
    });
};

// 导出工厂函数
//export const createLogger = JsonLogger.createLogger;
//export const createRequestLogger = JsonLogger.createRequestLogger;
// 导出包装函数而不是直接导出静态方法
export const createLogger = (context: LoggerContext, options?: LoggerOptions) => {
    return JsonLogger.createLogger(context, options);
};

export const createRequestLogger = (options?: any, loggerOptions?: LoggerOptions) => {
    return JsonLogger.createRequestLogger(options, loggerOptions);
};
// 默认导出
export const logger = createDefaultLogger();
export default logger;