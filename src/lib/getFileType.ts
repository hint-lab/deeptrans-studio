// src/lib/getFileType.ts
// 智能读取文件文本（支持 TXT/PDF/DOCX）

import { createLogger } from '@/lib/logger';
import { Buffer } from 'buffer'; // 如需显式导入
import fs from 'fs/promises';
import path from 'path';
const logger = createLogger({
    type: 'lib:getFileType',
}, {
    json: false,// 开启json格式输出
    pretty: false, // 关闭开发环境美化输出
    colors: true, // 仅当json：false时启用颜色输出可用
    includeCaller: false, // 日志不包含调用者
});
export async function extractFileTypeFromUrl(
    url: string
): Promise<{ isDoc: boolean; isPdf: boolean, isText: boolean }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000); // 45s 超时
    try {
        // 本地 data 目录：file://、相对/绝对路径优先
        const baseDir = path.resolve(process.cwd(), 'data');
        let localCandidate: string | null = null;
        try {
            if (url.startsWith('file://')) {
                localCandidate = decodeURI(new URL(url).pathname);
            } else if (!/^https?:\/\//i.test(url)) {
                const abs = path.isAbsolute(url)
                    ? url
                    : url.startsWith('data/')
                        ? path.resolve(baseDir, url.replace(/^data[\\\/]?/, ''))
                        : path.resolve(process.cwd(), url);
                localCandidate = abs;
            }
        } catch { }
        logger.debug('[extract] localCandidate:', localCandidate, ',[extract] url:', url);
        let contentType = '';
        let contentLength = 0;
        let buffer: Buffer | null = null;
        let localPath: string | null = null;
        if (localCandidate) {
            const abs = path.resolve(localCandidate);
            const rel = path.relative(baseDir, abs);
            if (rel.startsWith('..') || path.isAbsolute(rel)) {
                logger.error('[extract] local path outside data dir');
                return { isText: false, isPdf: false, isDoc: false };
            }
            const stat = await fs.stat(abs);
            if (stat.size > 25 * 1024 * 1024) {
                logger.error('[extract] File too large:', stat.size);
                return { isText: false, isPdf: false, isDoc: false };
            }
            buffer = await fs.readFile(abs);
            localPath = abs;
            const extname = path.extname(abs).toLowerCase();
            if (
                extname === '.txt' ||
                extname === '.md' ||
                extname === '.csv' ||
                extname === '.log'
            ) {
                contentType = 'text/plain';
            }
            if (extname === '.pdf') contentType = 'application/pdf';
            if (extname === '.docx')
                contentType =
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        }
        //获取URL文件类型
        const res = buffer ? null : await fetch(url, { signal: controller.signal });

        if (!buffer) {
            if (!res || !res.ok) {
                logger.error(`[extract] Fetch failed: ${res?.status} ${res?.statusText}`);
                return { isText: false, isPdf: false, isDoc: false };;
            }
            contentType = (res.headers.get('content-type') || '').toLowerCase();
            logger.info('[extract] contentType:', contentType || 'null');
            contentLength = Number(res.headers.get('content-length') || 0);
            if (contentLength && contentLength > 25 * 1024 * 1024) {
                logger.error('[extract] File too large:', contentLength);
                return { isText: false, isPdf: false, isDoc: false };
            }
        }

        // 通过 content-type 与扩展名双重判断
        let ext = '';
        try {
            if (buffer) {
                // 已在本地路径分支处理
            } else {
                const pathname = new URL(url).pathname.toLowerCase();
                const dot = pathname.lastIndexOf('.');
                ext = dot >= 0 ? pathname.slice(dot) : '';
            }
        } catch { }
        const isTextCT = contentType.startsWith('text/') || contentType.includes('plain');
        const isTextExt = ['.txt', '.md', '.csv', '.log'].includes(ext);
        const isText = isTextCT || isTextExt;

        const isPdfCT = contentType.includes('pdf');
        const isPdfExt = ext === '.pdf';
        const isPdf = isPdfCT || isPdfExt;

        const isDocxCT = contentType.includes('officedocument.wordprocessingml.document');
        const isDocxExt = ext === '.docx';
        const isDocx = isDocxCT || isDocxExt;
        logger.debug('[extract]', {
            contentType,
            contentLength,
            ext,
            isText,
            isPdf,
            isDocx,
            url: url.slice(0, 80) + '...',
        });
        return { isText: isText, isPdf: isPdf, isDoc: isDocx };
    } catch (err) {
        logger.error('[extract] General error:', (err as Error)?.message);
        return { isText: false, isPdf: false, isDoc: false };
    } finally {
        clearTimeout(timer);
    }
}
