import { LANGUAGES } from '@/constants/languages';

export function getLanguageByCode(code: string) {
    return LANGUAGES.find(l => l.key === code);
}

/**
 * 获取语言标签，如果找不到则返回代码本身
 */
export function getLanguageLabelByCode(code: string): string {
    const language = getLanguageByCode(code);
    if (!language) return code;

    // 简单的语言代码到标签的映射
    const labelMap: Record<string, string> = {
        zh: '中文',
        en: 'English',
        ja: '日本語',
        ko: '한국어',
        fr: 'Français',
        de: 'Deutsch',
        es: 'Español',
        ru: 'Русский',
        it: 'Italiano',
        pt: 'Português',
        ar: 'العربية',
        hi: 'हिन्दी',
        id: 'Bahasa Indonesia',
        vi: 'Tiếng Việt',
        th: 'ไทย',
        tr: 'Türkçe',
        nl: 'Nederlands',
        pl: 'Polski',
        sv: 'Svenska',
        no: 'Norsk',
        da: 'Dansk',
        fi: 'Suomi',
        he: 'עברית',
        uk: 'Українська',
        cs: 'Čeština',
        el: 'Ελληνικά',
        ro: 'Română',
        hu: 'Magyar',
        sk: 'Slovenčina',
        sl: 'Slovenščina',
        bg: 'Български',
        hr: 'Hrvatski',
        sr: 'Српски',
        fa: 'فارسی',
        ur: 'اردو',
        bn: 'বাংলা',
        ms: 'Bahasa Melayu',
        fil: 'Filipino',
        ta: 'தமிழ்',
        te: 'తెలుగు',
        mr: 'मराठी',
        pa: 'ਪੰਜਾਬੀ',
        gu: 'ગુજરાતી',
        kn: 'ಕನ್ನಡ',
        ml: 'മലയാളം',
        sw: 'Kiswahili',
        auto: 'Auto',
    };

    return labelMap[language.key] || language.key;
}
