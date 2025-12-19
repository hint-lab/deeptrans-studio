// app/actions/parse-docx.ts
'use server';

import { extractDocxFromUrl } from '@/lib/parsers/docx-parser';

export async function parseDocxAction(url: string) {
    try {
        // 验证输入
        if (!url || typeof url !== 'string') {
            throw new Error('Invalid URL provided');
        }

        // 调用你的解析器（服务器端）
        const result = await extractDocxFromUrl(url);

        return {
            success: true,
            data: result,
            error: null
        };
    } catch (error) {
        console.error('DOCX parsing failed:', error);
        return {
            success: false,
            data: null,
            error: error instanceof Error ? error.message : 'Failed to parse DOCX file'
        };
    }
}