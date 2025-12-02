// lib/console-enhanced.ts
class EnhancedConsole {
  private getCallerInfo() {
    const error = new Error();
    const stack = error.stack?.split('\n') || [];
    
    // 获取调用栈的第三行（跳过new Error和getCallerInfo）
    const callerLine = stack[3] || '';
    
    // 提取文件和行号
    const match = callerLine.match(/\((.*):(\d+):(\d+)\)/);
    if (match) {
      const [, filePath, line, column] = match;
      const fileName = filePath ? filePath.split('/').pop() : 'unknown';
      return { fileName, line, column };
    }
    
    return { fileName: 'unknown', line: '0', column: '0' };
  }
  
  private formatMessage(level: string, ...args: any[]) {
    const now = new Date();
    const timestamp = now.toISOString().replace('T', ' ').substring(0, 19);
    const caller = this.getCallerInfo();
    
    return `\x1b[90m${timestamp}\x1b[0m \x1b[36m[${caller.fileName}:${caller.line}]\x1b[0m \x1b[32m[${level}]\x1b[0m ${args.join(' ')}`;
  }
  
  log(...args: any[]) {
    console.log(this.formatMessage('LOG', ...args));
  }
  
  info(...args: any[]) {
    console.info(this.formatMessage('INFO', ...args));
  }
  
  warn(...args: any[]) {
    console.warn(this.formatMessage('WARN', ...args));
  }
  
  error(...args: any[]) {
    console.error(this.formatMessage('ERROR', ...args));
    
    // 如果是Error对象，显示堆栈
    const lastArg = args[args.length - 1];
    if (lastArg instanceof Error && lastArg.stack) {
      console.error('\x1b[31m%s\x1b[0m', lastArg.stack);
    }
  }
  
  debug(...args: any[]) {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(this.formatMessage('DEBUG', ...args));
    }
  }
}

export const logger = new EnhancedConsole();