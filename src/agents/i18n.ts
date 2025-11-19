import enMessages from '../i18n/en.json';
import zhMessages from '../i18n/zh.json';

/**
 * Agent国际化工具类
 */
export class AgentI18n {
    private messages: any;

    constructor(private locale: string = 'zh') {
        // 直接加载对应语言的消息
        this.messages = locale === 'en' ? enMessages.Agents : zhMessages.Agents;
    }

    async init() {
        // 不需要异步初始化了
        return this;
    }

    /**
     * 获取嵌套对象中的值
     */
    private getValue(path: string): string {
        const keys = path.split('.');
        let value = this.messages;
        for (const key of keys) {
            value = value?.[key];
            if (value === undefined) {
                console.warn(`Missing translation key: Agents.${path} for locale ${this.locale}`);
                return `[Missing: ${path}]`;
            }
        }
        return String(value || '');
    }

    /**
     * 替换参数占位符
     */
    private replaceParams(text: string, params?: Record<string, string>): string {
        if (!params) return text;
        let result = text;
        Object.entries(params).forEach(([k, v]) => {
            result = result.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
        });
        return result;
    }

    /**
     * 获取角色翻译
     */
    getRole(key: string): string {
        return this.getValue(`roles.${key}`);
    }

    /**
     * 获取领域翻译
     */
    getDomain(key: string): string {
        return this.getValue(`domains.${key}`);
    }

    /**
     * 获取语言翻译
     */
    getLanguage(key: string): string {
        return this.getValue(`languages.${key}`);
    }

    /**
     * 获取质量等级翻译
     */
    getQuality(key: string): string {
        return this.getValue(`quality.${key}`);
    }

    /**
     * 获取正式度翻译
     */
    getFormality(key: string): string {
        return this.getValue(`formality.${key}`);
    }

    /**
     * 获取系统提示词翻译
     */
    getSystemPrompt(key: string, params?: Record<string, string>): string {
        const text = this.getValue(`prompts.system.${key}`);
        return this.replaceParams(text, params);
    }

    /**
     * 获取用户提示词翻译
     */
    getUserPrompt(key: string, params?: Record<string, string>): string {
        const text = this.getValue(`prompts.user.${key}`);
        return this.replaceParams(text, params);
    }

    /**
     * 获取特定Agent的提示词翻译
     */
    getAgentPrompt(agentType: string, key: string, params?: Record<string, string>): string {
        const text = this.getValue(`prompts.${agentType}.${key}`);
        return this.replaceParams(text, params);
    }
}

/**
 * 创建Agent国际化实例
 */
export async function createAgentI18n(locale: string = 'zh'): Promise<AgentI18n> {
    const i18n = new AgentI18n(locale);
    await i18n.init();
    return i18n;
}
