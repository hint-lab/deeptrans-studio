import { chatJSON, chatText } from '../lib/llm';
import { createAgentI18n, type AgentI18n } from './i18n';

export type AgentRunContext = {
    projectId?: string;
    userId?: string;
    locale?: string; // 添加语言环境支持
};

export interface AgentConfig {
    name: string;
    role?: string;
    domain?: string;
    sourceLanguage?: string;
    targetLanguage?: string;
    specialty?: string;
    quality?: 'draft' | 'review' | 'final';
    formality?: 'informal' | 'neutral' | 'formal';
    locale?: string; // 添加语言环境配置
}

export abstract class BaseAgent<TInput, TOutput> {
    protected readonly name: string;
    protected readonly role: string;
    protected readonly domain: string;
    protected readonly sourceLanguage: string;
    protected readonly targetLanguage: string;
    protected readonly specialty: string;
    protected readonly quality: 'draft' | 'review' | 'final';
    protected readonly formality: 'informal' | 'neutral' | 'formal';
    protected readonly locale: string;

    constructor(config: AgentConfig | string) {
        if (typeof config === 'string') {
            // 向后兼容
            this.name = config;
            this.role = 'professional_assistant';
            this.domain = 'general';
            this.sourceLanguage = 'auto';
            this.targetLanguage = 'zh';
            this.specialty = '通用处理';
            this.quality = 'review';
            this.formality = 'neutral';
            this.locale = 'zh';
        } else {
            this.name = config.name;
            this.role = config.role || 'professional_assistant';
            this.domain = config.domain || 'general';
            this.sourceLanguage = config.sourceLanguage || 'auto';
            this.targetLanguage = config.targetLanguage || 'zh';
            this.specialty = config.specialty || '通用处理';
            this.quality = config.quality || 'review';
            this.formality = config.formality || 'neutral';
            this.locale = config.locale || 'zh';
        }
    }

    abstract execute(input: TInput, ctx?: AgentRunContext): Promise<TOutput>;
    async run(input: TInput, ctx?: AgentRunContext): Promise<TOutput> {
        return this.execute(input, ctx);
    }

    // Core LLM wrappers (for subclasses)
    protected async json<T = any>(
        messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
        opts?: { maxTokens?: number }
    ): Promise<T> {
        console.log('发送的json消息:', JSON.stringify(messages, null, 2));
        return chatJSON<T>(messages as any, opts);
    }
    protected async text(
        messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
        opts?: { maxTokens?: number }
    ): Promise<string> {
        console.log('发送的text消息:', JSON.stringify(messages, null, 2));
        return chatText(messages as any, opts);
    }

    // Core prompt building
    protected async buildPrompt(
        outputFormat: 'json' | 'text' = 'text',
        constraints?: string[]
    ): Promise<string> {
        const i18n = await createAgentI18n(this.locale);

        // 获取翻译后的角色、领域等信息
        const roleText = i18n.getRole(this.role);
        const domainText = i18n.getDomain(this.domain);
        console.log('sourceLanguage:', this.sourceLanguage);
        console.log('targetLanguage:', this.targetLanguage);
        const sourceLanguageText = i18n.getLanguage(this.sourceLanguage);
        const targetLanguageText = i18n.getLanguage(this.targetLanguage);
        const qualityText = i18n.getQuality(this.quality);
        const formalityText = i18n.getFormality(this.formality);

        let prompt = i18n.getSystemPrompt('base', { role: roleText });
        console.log('初始发送的消息:', JSON.stringify(prompt, null, 2));
        // 添加领域信息
        if (this.domain !== 'general') {
            prompt += i18n.getSystemPrompt('domain', { domain: domainText });
        }

        // 添加语言对信息
        if (this.sourceLanguage !== 'auto' || this.targetLanguage !== 'zh') {
            prompt += i18n.getSystemPrompt('language_pair', {
                sourceLanguage: sourceLanguageText,
                targetLanguage: targetLanguageText,
            });
        }

        // 添加质量等级
        prompt += i18n.getSystemPrompt('quality_requirement', { quality: qualityText });

        // 添加正式度
        prompt += i18n.getSystemPrompt('style', { formality: formalityText });

        if (outputFormat === 'json') {
            prompt += i18n.getSystemPrompt('json_output');
        } else {
            prompt += i18n.getSystemPrompt('text_output');
        }

        if (constraints?.length) {
            prompt += `\n${i18n.getSystemPrompt('requirements')}\n${constraints.map((c, i) => `${i + 1}) ${c}`).join('\n')}`;
        }
        console.log('返回的发送的消息:', JSON.stringify(prompt, null, 2));
        return prompt;
    }

    protected async buildUserPref(pref?: string): Promise<string> {
        if (!pref || !String(pref).trim()) return '';
        const i18n = await createAgentI18n(this.locale);
        return i18n.getUserPrompt('preference', { preference: String(pref).trim() });
    }

    protected async buildGlossary(
        dict?: Array<{ term: string; translation: string }>,
        maxItems: number = 200
    ): Promise<string> {
        const list = Array.isArray(dict) ? dict.slice(0, maxItems) : [];
        if (!list.length) return '';
        const i18n = await createAgentI18n(this.locale);
        const entries = list.map(d => `${d.term} => ${d.translation}`).join('\n');
        return i18n.getUserPrompt('glossary', { entries });
    }

    // Generic message builder
    protected messages(
        systemContent: string,
        userContent: string
    ): Array<{ role: 'system' | 'user'; content: string }> {
        return [
            { role: 'system' as const, content: systemContent },
            { role: 'user' as const, content: userContent },
        ];
    }
}
