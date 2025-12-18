import { BaseAgent, type AgentRunContext } from '../base';
import { TermCandidate } from '@/types/terms';
import { createAgentI18n } from '../i18n';

export class MonoTermExtractAgent extends BaseAgent<
    { text: string; prompt?: string; locale?: string; domain?: string },
    TermCandidate[]
> {
    constructor(locale?: string, domain?: string) {
        super({
            name: 'mono-term-extract',
            role: 'term_extractor',
            domain: domain || 'general',
            quality: 'review',
            locale: locale || 'zh',
        });
    }

    async execute(
        input: { text: string; prompt?: string; locale?: string },
        ctx?: AgentRunContext
    ): Promise<TermCandidate[]> {
        const locale = ctx?.locale || input.locale || this.locale;
        const i18n = await createAgentI18n(locale);

        const systemPrompt = await this.buildPrompt('json', [
            i18n.getAgentPrompt('mono_term_extract', 'output_format'),
        ]);

        const userPref = await this.buildUserPref(input.prompt);
        const textToProcess = i18n.getUserPrompt('text_to_process', { text: input.text || '' });
        const userContent = `${userPref}${textToProcess}`;

        const messages = this.messages(systemPrompt, userContent);
        const json = await this.json<TermCandidate[]>(messages, { maxTokens: 800 });
        return Array.isArray(json) ? json : [];
    }
}
