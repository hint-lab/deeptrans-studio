// app/actions/parse-docx.ts
'use server';

import { createLogger } from '@/lib/logger';
import { requireUser } from '@/lib/guards';
import { extractDocxFromBuffer } from '@/lib/parsers/docx-parser';
import { getReadableUploadedObjectBufferForOwner } from '@/server/uploaded-object';
const logger = createLogger(
    {
        type: 'actions:parse-docs',
    },
    {
        json: false, // 开启json格式输出
        pretty: false, // 关闭开发环境美化输出
        colors: true, // 仅当json：false时启用颜色输出可用
        includeCaller: false, // 日志不包含调用者
    }
);
const DOCX_PARSE_FAILED = '无法解析已上传的 DOCX 文档，请确认文件未损坏后重试';

export async function parseDocxAction(fileName: string) {
    try {
        const authCtx = await requireUser();
        const normalizedFileName = String(fileName || '').trim();
        if (!normalizedFileName) {
            return {
                success: false,
                data: null,
                error: DOCX_PARSE_FAILED,
            };
        }

        // The browser supplies a storage object key, never a URL. Resolve the
        // owner-scoped object directly so this action cannot become an SSRF
        // endpoint through a user-controlled fetch destination.
        const buffer = await getReadableUploadedObjectBufferForOwner(normalizedFileName, authCtx);
        const result = await extractDocxFromBuffer(buffer);
        logger.info('DOCX parsing success', { characters: result.text.length });
        return {
            success: true,
            data: result,
            error: null,
        };
    } catch (error) {
        logger.error('DOCX parsing failed', {
            errorName: error instanceof Error ? error.name : typeof error,
        });
        return {
            success: false,
            data: null,
            error: DOCX_PARSE_FAILED,
        };
    }
}
