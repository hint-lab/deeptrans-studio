// app/actions/parse-docx.ts
'use server';

import { createLogger } from '@/lib/logger';
import { extractDocxFromUrl } from '@/lib/parsers/docx-parser';
const logger = createLogger({
    type: 'actions:parse-docs',
}, {
    json: false,// 开启json格式输出
    pretty: false, // 关闭开发环境美化输出
    colors: true, // 仅当json：false时启用颜色输出可用
    includeCaller: false, // 日志不包含调用者
});
export async function parseDocxAction(url: string) {
    try {
        // 验证输入
        if (!url || typeof url !== 'string') {
            throw new Error('Invalid URL provided');
        }

        // 调用你的解析器（服务器端）
        const result = await extractDocxFromUrl(url);
        logger.info('DOCX parsing success,data:', result);
        return {
            success: true,
            data: result,
            error: null
        };
    } catch (error) {
        logger.error('DOCX parsing failed:', error);
        return {
            success: false,
            data: null,
            error: error instanceof Error ? error.message : 'Failed to parse DOCX file'
        };
    }
}