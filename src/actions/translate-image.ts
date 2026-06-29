// app/actions/translate-image.ts
'use server'
import { createLogger } from '@/lib/logger';
import { requireUser } from '@/lib/guards';
import { pdfParseToStructuredJson } from '@/lib/parsers/pdf-parser';
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
    zh: ['ch', '中文'],
    'zh-CN': ['ch', '中文'],
    en: ['en', '英语'],
    ja: ['japan', '日语'],
    ko: ['korean', '韩语'],
    fr: ['latin', '法语'],
    es: ['latin', '西班牙语'],
    de: ['latin', '德语'],
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
    if (!language || language === 'auto') return process.env.MINERU_LANGUAGE || 'ch'
    if (language === 'zh-CN' || language === 'zh') return 'ch'
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

export async function fetchTextFromImg(
    imageUrl: string,
    options?: TranslateImageOptions
): Promise<OcrActionResult> {
    await requireUser();
    const language = normalizeOcrLanguage(options?.sourceLang || 'auto')
    const shouldEnhance = options?.enhanceImage ?? true
    const timeout = options?.timeout || 60000

    try {
        logger.info('MinerU image OCR started:', { language, enhanceImage: shouldEnhance })
        const data = await pdfParseToStructuredJson(imageUrl, {
            language,
            isOcr: true,
            enableTable: true,
            enableFormula: false,
            timeoutMs: timeout,
        })

        const text = extractOcrText(data)
        if (!text) {
            logger.error('MinerU image OCR returned empty text:', { source: data?.structured?.source })
            return {
                success: false,
                error: '未识别到图片文字',
                data,
            }
        }

        logger.info('MinerU image OCR completed:', {
            chars: text.length,
            language,
            source: data?.structured?.source,
        })
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
        logger.error('MinerU图片识别错误:', error);
        return {
            success: false,
            error: message,
        }
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
