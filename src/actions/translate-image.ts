// app/actions/translate-image.ts
'use server'
import { createLogger } from '@/lib/logger';
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
    'zh-CN': ['chi_sim', '中文'],
    'en': ['eng', '英语'],
    'ja': ['jpn', '日语'],
    'ko': ['kor', '韩语'],
    'fr': ['fra', '法语'],
    'es': ['spa', '西班牙语'],
    'de': ['deu', '德语'],
} as const

type SupportedLang = keyof typeof SUPPORTED_LANGUAGES

interface TranslateImageOptions {
    targetLang?: SupportedLang
    enhanceImage?: boolean
    timeout?: number
}


export async function fetchTextFromImg(
    imageUrl: string,
    options?: TranslateImageOptions
) {
    const targetLang: SupportedLang = (options?.targetLang || 'zh-CN') as SupportedLang
    const shouldEnhance = options?.enhanceImage ?? true
    const timeout = options?.timeout || 60000

    try {
        const ocr_auth_url = process.env.OCR_AUTH_URL ?? 'http://localhost:5000/api/v1/auth/token';
        const ocr_base_url = process.env.OCR_BASE_URL ?? 'http://localhost:5000/api/v1/ocr/url';
        logger.info("OCR_AUTH_URL:", ocr_auth_url)
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
        const response = await fetch(ocr_base_url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${access_token}`,
            },
            body: JSON.stringify({
                "file_url": imageUrl,
                "language": "en",
            }),
        });
        const data = await response.json();
        if (!response.ok) {
            logger.error(data.success, data.message)
            throw new Error(`后端服务错误: ${response.status}`);
        }
        return data;



    } catch (error) {
        logger.error('OCR处理错误:', error);
        return
    }

}
// 获取支持的语言列表
export async function getSupportedLanguages() {
    return Object.entries(SUPPORTED_LANGUAGES).map(([code, [tessCode, name]]) => ({
        code,
        tessCode,
        name,
        displayName: name
    }))
}