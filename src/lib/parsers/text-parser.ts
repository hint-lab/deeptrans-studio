/**
 * 将 Markdown 字符串转换为指定 JSON 格式
 */
import { createLogger } from '@/lib/logger';
const logger = createLogger({
    type: 'lib:text-parser',
}, {
    json: false,// 开启json格式输出
    pretty: false, // 关闭开发环境美化输出
    colors: true, // 仅当json：false时启用颜色输出可用
    includeCaller: false, // 日志不包含调用者
});

export async function textToStructuredJson(url: string): Promise<{ text: string; html?: string; contentType?: string; structured?: any }> {
    const controller = new AbortController();
    let buffer: Buffer;
    let contentType = '';
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) {
            return { text: '', contentType: res.headers.get('content-type') || '' };
        }
        contentType = (res.headers.get('content-type') || '').toLowerCase();
        const arrayBuf = await res.arrayBuffer();
        buffer = Buffer.from(arrayBuf);
        const fullText = buffer.toString('utf-8');
        const paragraphs = fullText.split(/\r\n|\r|\n/).filter(p => p.length > 0);

        const result = {
            outline: [] as any[],
            lists: [] as any[],
            tables: [] as any[],
            links: [] as any[],
            footnotes: [] as any[],
            images: [] as any[],
            paragraphs: [] as Array<{
                level: null;
                text: string;
                runs: Array<{ text: string; bold: boolean; italic: boolean; underline: boolean; sizePt: number }>;
                placeholderSpans: Array<{ index: number; text: string; start: number; end: number }>;
            }>,
        };
        const html = fullText;
        const structured = result;
        const text = fullText;
        for (const para of paragraphs) {
            // 简化：所有文本视为普通 run（无格式）
            // 若需解析 **bold** 或 *italic*，可用 remark + custom plugin
            const runs = [{
                text: para + '  ', // 模拟 pdf2json 末尾空格习惯
                bold: false,
                italic: false,
                underline: false,
                sizePt: para === para.toUpperCase() && !para.includes(' ') ? 14 : 12, // 粗略判断标题
            }];

            // placeholderSpans：整段作为一个 span
            const placeholderSpans = [{
                index: 0,
                text: para,
                start: 0,
                end: para.length,
            }];

            result.paragraphs.push({
                level: null, // Markdown 无显式层级（除非解析 # 标题）
                text: para,
                runs,
                placeholderSpans,
            });
            logger.info("text structured: ", structured.paragraphs[0] || "null")
        }
        return { text, html, contentType, structured };

    } catch (err) {
        logger.error('[extract] General error:', (err as Error)?.message);
        return { text: '', contentType: '' };
    }
}