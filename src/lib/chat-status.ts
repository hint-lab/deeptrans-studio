export type ChatLocale = 'zh' | 'en';

export function chatLocale(value: unknown): ChatLocale {
    return typeof value === 'string' && value.toLowerCase().startsWith('en') ? 'en' : 'zh';
}

export function chatStatus(localeValue: unknown) {
    const locale = chatLocale(localeValue);
    if (locale === 'en') {
        return {
            empty: 'No usable response was returned. Please try again.',
            interrupted: 'Generation was interrupted. Please try again.',
            persistenceFailed:
                'The response was generated but could not be saved. Copy it before refreshing.',
            requestFailed: 'The request could not be completed. Please try again.',
            invalidRequest: 'Check the request and try again.',
            unauthorized: 'Sign in again to continue.',
            busy: 'This conversation is still generating. Please wait and try again.',
            unavailable: 'The chat service is unavailable. Please try again later.',
            protocolFailed: 'The chat service returned an invalid response. Please try again.',
        };
    }
    return {
        empty: '本次请求未返回有效内容，请重试。',
        interrupted: '生成中断，请稍后重试。',
        persistenceFailed: '回复已生成，但未能保存到对话。请在刷新前复制内容。',
        requestFailed: '本次请求未完成，请重试。',
        invalidRequest: '请求内容无效，请检查后重试。',
        unauthorized: '登录已失效，请重新登录后继续。',
        busy: '当前对话仍在生成，请等待完成后再发送。',
        unavailable: '聊天服务暂时不可用，请稍后重试。',
        protocolFailed: '聊天服务返回了无效响应，请稍后重试。',
    };
}
