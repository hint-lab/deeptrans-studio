// utils/pdfParseToStructuredJson.ts
import { createLogger } from '@/lib/logger';

/**
 * 使用 pdf-parse 提取 PDF 文本，并转换为指定结构化 JSON 格式
 * @param buffer - PDF 文件的 Buffer
 * @returns 符合目标 schema 的 JSON 对象
 */
const logger = createLogger({
    type: 'lib:pdf-parser',
}, {
    json: false,// 开启json格式输出
    pretty: false, // 关闭开发环境美化输出
    colors: true, // 仅当json：false时启用颜色输出可用
    includeCaller: false, // 日志不包含调用者
});
export async function pdfParseToStructuredJson(url: string): Promise<{ text: string; html?: string; contentType?: string; structured?: any }> {
    const controller = new AbortController();
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
    try {
        let contentType = '';
        const ocr_auth_url = process.env.OCR_AUTH_URL ?? 'http://localhost:5000/api/v1/auth/token';
        const ocr_base_url = process.env.OCR_BASE_URL ?? 'http://localhost:5000/api/v1/ocr/url';
        logger.info("获取OCR服务令牌,OCR_AUTH_URL:", ocr_auth_url)
        const res = await fetch(ocr_auth_url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                "client_id": process.env.OCR_CLIENT_ID || "default_client",
                "client_secret": process.env.OCR_CLIENT_SECRET
            }),
        });
        let resjson = await res.json();
        const access_token = resjson?.data?.access_token;
        if (!res.ok || !access_token) {
            logger.error('获取访问令牌失败:', resjson);
            throw new Error(`后端服务错误: ${res.status}`);
        }
        logger.info("OCR识别中...", ocr_base_url)
        const response = await fetch(ocr_base_url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${access_token}`,
            },
            body: JSON.stringify({
                "file_url": url,
                "language": "en",
            }),
        });
        const res1 = await response.json();
        logger.info("data:", res)
        if (!response.ok) {
            logger.error(res1.success, res1.message)
            throw new Error(`后端服务错误: ${response.status}`);
        }
        const jsonString = res1.data.ocr_result.text;
        // 2. 将字符串解析为真正的数组对象
        const items = JSON.parse(jsonString);
        const paragraphs = items
            .filter((item: any) => item.type === 'text')
            .map((item: any) => item.text);
        const combinedText = paragraphs.join('\n\n');
        // Step 3: 构建目标结构
        logger.debug("pdf paragraphs: ", paragraphs || "null")
        for (const para of paragraphs) {
            // runs: pdf-parse 无格式信息 → 全部设为普通文本
            const runs = [{
                text: para + '  ', // 模拟 pdf2json 习惯（末尾加空格）
                bold: false,
                italic: false,
                underline: false,
                sizePt: 12, // 无法获取真实字号，设为默认
            }];

            // placeholderSpans: 整段作为一个 span（因无引用断点信息）
            const placeholderSpans = [{
                index: 0,
                text: para,
                start: 0,
                end: para.length,
            }];

            result.paragraphs.push({
                level: null,
                text: para,
                runs,
                placeholderSpans,
            });
        }
        const html = combinedText;
        const structured = result;
        const text = combinedText;
        logger.info("第一段pdf structured: ", structured.paragraphs[0] || "null")
        return { text, html, contentType, structured };
    } catch (err) {
        // 捕获并记录详细错误
        const errorMessage = (err as Error)?.message || 'Unknown error';
        logger.error('[pdfParseToStructuredJson] Error:', errorMessage);

        // 关键修改：重新抛出错误 (Re-throw)
        // 这样外层的 POST 处理函数才能捕获到异常，进而返回 500 并清理 Redis
        throw err;
    }
}