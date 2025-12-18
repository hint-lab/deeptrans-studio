import pino from 'pino';

// 单例模式
class LoggerSingleton {
    private static instance: pino.Logger;

    static getInstance(): pino.Logger {
        if (!LoggerSingleton.instance) {
            LoggerSingleton.instance = pino({
                level: process.env.LOG_LEVEL || 'info',
                //timestamp: () => `,"time":"${new Date().toISOString()}"`,
                timestamp: () => `,"time":"${new Date().toLocaleString()}"`,
                formatters: {
                    level: (label: string) => {
                        return { level: label }; // 使用字符串而不是数字
                    },
                },
                base: {
                    env: process.env.NODE_ENV,
                    app: process.env.APP_NAME || 'nextjs-app',
                    version: process.env.APP_VERSION || '1.0.0',
                },
                redact: [
                    'password',
                    'token',
                    'secret',
                    'authorization',
                    'cookie',
                    'creditCard',
                    'ssn',
                    '*.password',
                    '*.token',
                    '*.secret',
                ],
                // 配置...
            });

            // 记录初始化
            LoggerSingleton.instance.info('Logger initialized');
        }
        return LoggerSingleton.instance;
    }
    /**
     * 创建具有上下文的子 Logger
     */
    static createContextLogger(context: {
        module?: string;
        service?: string;
        version?: string;
        [key: string]: any;
    }): pino.Logger {
        const instance = LoggerSingleton.getInstance();

        // 清理上下文，移除 undefined 值
        const cleanContext = Object.entries(context).reduce(
            (acc, [key, value]) => {
                if (value !== undefined && value !== null) {
                    acc[key] = value;
                }
                return acc;
            },
            {} as Record<string, any>
        );

        // 添加默认跟踪信息
        const enhancedContext = {
            ...cleanContext,
            hostname:
                typeof process !== 'undefined'
                    ? process.env.HOSTNAME || 'localhost'
                    : 'edge-runtime',
            runtime: typeof process !== 'undefined' ? 'node' : 'edge',
        };
        return instance.child(enhancedContext);
    }
    /**
     * 创建请求上下文 Logger
     */
    static createRequestLogger(
        requestId: string,
        options?: {
            userId?: string;
            sessionId?: string;
            userAgent?: string;
            ip?: string;
            method?: string;
            path?: string;
            referer?: string;
        }
    ): pino.Logger {
        const instance = LoggerSingleton.getInstance();

        const context = {
            type: 'request',
            requestId,
            ...options,
        };

        return instance.child(context);
    }
}

// 导出全局实例
export const logger = LoggerSingleton.getInstance();
export const createLogger = LoggerSingleton.createContextLogger.bind(LoggerSingleton);
export const createRequestLogger = LoggerSingleton.createRequestLogger.bind(LoggerSingleton);
export default logger;
