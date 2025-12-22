// app/actions/translate-image.ts
'use server'
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
        if (process.env.NODE_ENV === 'production') {
            imageUrl = imageUrl.replace('127.0.0.1', process.env.NEXT_PUBLIC_MINIO_ENDPOINT || 'minio.deeptrans.studio');
        }
        const ocr_auth_url = process.env.OCR_AUTH_URL ?? 'http://localhost:5000/api/v1/auth/token';
        const ocr_base_url = process.env.OCR_BASE_URL ?? 'http://localhost:5000/api/v1/ocr/url';
        console.log(ocr_auth_url)
        console.log(process.env.OCR_CLIENT_SECRET)
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
            console.error('获取访问令牌失败:', resjson);
            throw new Error(`后端服务错误: ${res.status}`);
        }
        const response = await fetch(ocr_base_url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${access_token}`,
            },
            body: JSON.stringify({
                "image_url": imageUrl,
                "language": "eng",
                "psm": "6",
                "oem": "3"
            }),
        });
        const data = await response.json();
        if (!response.ok) {
            console.log(data.success, data.message)
            throw new Error(`后端服务错误: ${response.status}`);
        }
        return data;



    } catch (error) {
        console.error('OCR处理错误:', error);
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