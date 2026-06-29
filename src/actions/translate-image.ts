// app/actions/translate-image.ts
'use server'
import { createLogger } from '@/lib/logger';
import { requireUser } from '@/lib/guards';
const logger = createLogger({
    type: 'actions:translate-image',
}, {
    json: false,// 开启json格式输出
    pretty: false, // 关闭开发环境美化输出
    colors: true, // 仅当json：false时启用颜色输出可用
    includeCaller: false, // 日志不包含调用者
});
// 配置语言支持
const SUPPORTED_LANGUAGES = {
    auto: ['auto', '自动检测'],
    zh: ['zh', '中文'],
    'zh-CN': ['zh', '中文'],
    en: ['en', '英语'],
    ja: ['ja', '日语'],
    ko: ['ko', '韩语'],
    fr: ['fr', '法语'],
    es: ['es', '西班牙语'],
    de: ['de', '德语'],
} as const

type SupportedLang = keyof typeof SUPPORTED_LANGUAGES

interface TranslateImageOptions {
    sourceLang?: SupportedLang | string
    targetLang?: SupportedLang | string
    enhanceImage?: boolean
    timeout?: number
}

type OcrActionResult =
    | {
          success: true
          text: string
          data: unknown
          language: string
      }
    | {
          success: false
          error: string
          data?: unknown
      }

function normalizeOcrLanguage(language?: string) {
    if (!language || language === 'auto') return 'auto'
    if (language === 'zh-CN' || language === 'zh') return 'zh'
    if (language in SUPPORTED_LANGUAGES) {
        return SUPPORTED_LANGUAGES[language as SupportedLang][0]
    }
    return language
}

function readPath(value: unknown, path: string[]) {
    return path.reduce<unknown>((current, key) => {
        if (!current || typeof current !== 'object') return undefined
        return (current as Record<string, unknown>)[key]
    }, value)
}

function collectText(value: unknown): string {
    if (typeof value === 'string') return value.trim()
    if (Array.isArray(value)) {
        return value
            .map(item => {
                if (typeof item === 'string') return item
                if (!item || typeof item !== 'object') return ''
                const record = item as Record<string, unknown>
                if (record.type && record.type !== 'text' && !record.text) return ''
                return collectText(record.text ?? record.content ?? record.value)
            })
            .filter(Boolean)
            .join('\n')
            .trim()
    }
    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>
        return collectText(
            record.text ??
                record.content ??
                record.markdown ??
                record.words ??
                record.lines ??
                record.items ??
                record.blocks
        )
    }
    return ''
}

function parseTextPayload(value: unknown): string {
    const text = collectText(value)
    if (!text) return ''

    try {
        const parsed = JSON.parse(text)
        return collectText(parsed) || text
    } catch {
        return text
    }
}

function extractOcrText(data: unknown): string {
    const candidatePaths = [
        ['data', 'ocr_result', 'text'],
        ['data', 'ocr_result'],
        ['data', 'text'],
        ['data', 'content'],
        ['ocr_result', 'text'],
        ['ocr_result'],
        ['result', 'text'],
        ['result'],
        ['text'],
        ['content'],
    ]

    for (const path of candidatePaths) {
        const text = parseTextPayload(readPath(data, path))
        if (text) return text
    }

    return parseTextPayload(data)
}

async function readJsonResponse(response: Response) {
    const text = await response.text()
    if (!text) return null
    try {
        return JSON.parse(text)
    } catch {
        return { text }
    }
}

export async function fetchTextFromImg(
    imageUrl: string,
    options?: TranslateImageOptions
): Promise<OcrActionResult> {
    await requireUser();
    const language = normalizeOcrLanguage(options?.sourceLang || 'auto')
    const shouldEnhance = options?.enhanceImage ?? true
    const timeout = options?.timeout || 60000
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
        const ocr_auth_url = process.env.OCR_AUTH_URL ?? 'http://localhost:5000/api/v1/auth/token';
        const ocr_base_url = process.env.OCR_BASE_URL ?? 'http://localhost:5000/api/v1/ocr/url';
        logger.info('OCR request started:', { language, enhanceImage: shouldEnhance })
        const res = await fetch(ocr_auth_url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            signal: controller.signal,
            body: JSON.stringify({
                "client_id": process.env.OCR_CLIENT_ID || "default_client",
                "client_secret": process.env.OCR_CLIENT_SECRET
            }),
        });
        const resjson = await readJsonResponse(res);
        const access_token = resjson?.data?.access_token;
        if (!res.ok || !access_token) {
            logger.error('获取访问令牌失败:', { status: res.status, body: resjson });
            throw new Error(`后端服务错误: ${res.status}`);
        }
        const response = await fetch(ocr_base_url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${access_token}`,
            },
            signal: controller.signal,
            body: JSON.stringify({
                "file_url": imageUrl,
                "language": language,
                "enhance_image": shouldEnhance,
            }),
        });
        const data = await readJsonResponse(response);
        if (!response.ok) {
            logger.error('OCR请求失败:', { status: response.status, body: data })
            throw new Error(`后端服务错误: ${response.status}`);
        }

        const text = extractOcrText(data)
        if (!text) {
            logger.error('OCR返回为空:', { body: data })
            return {
                success: false,
                error: '未识别到图片文字',
                data,
            }
        }

        logger.info('OCR request completed:', { chars: text.length, language })
        return {
            success: true,
            text,
            data,
            language,
        };
    } catch (error) {
        const message =
            error instanceof Error && error.name === 'AbortError'
                ? '图片识别超时'
                : error instanceof Error
                  ? error.message
                  : '图片识别失败'
        logger.error('OCR处理错误:', error);
        return {
            success: false,
            error: message,
        }
    } finally {
        clearTimeout(timeoutId)
    }

}
// 获取支持的语言列表
export async function getSupportedLanguages() {
    await requireUser();
    return Object.entries(SUPPORTED_LANGUAGES).map(([code, [tessCode, name]]) => ({
        code,
        tessCode,
        name,
        displayName: name
    }))
}
