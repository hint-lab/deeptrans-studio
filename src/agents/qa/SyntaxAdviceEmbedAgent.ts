import { BaseAgent, type AgentRunContext } from '../base';
import { createAgentI18n } from '../i18n';

export class SyntaxAdviceEmbedAgent extends BaseAgent<
    {
        source: string;
        target: string;
        issues: Array<{ type?: string; span?: string; advice?: string }>;
        prompt?: string;
        locale?: string;
    },
    string
> {
    constructor(locale?: string) {
        super({
            name: 'qa:syntax-advice-embed',
            role: 'post_editor',
            domain: 'linguistics',
            specialty: '句法修正',
            quality: 'final',
            locale: locale || 'zh',
        });
    }

    async execute(
        input: {
            source: string;
            target: string;
            issues: Array<{ type?: string; span?: string; advice?: string }>;
            prompt?: string;
            locale?: string;
        },
        ctx?: AgentRunContext
    ): Promise<string> {
        const locale = ctx?.locale || input.locale || this.locale;
        const i18n = await createAgentI18n(locale);

        const systemPrompt = await this.buildPrompt('text', [
            i18n.getAgentPrompt('syntax_advice_embed', 'minimal_revision'),
            i18n.getAgentPrompt('syntax_advice_embed', 'preserve_meaning'),
        ]);

        const userPref = await this.buildUserPref(input.prompt);
        const list = Array.isArray(input.issues) ? input.issues : [];
        const formatted = list
            .map(
                (a, i) =>
                    `#${i + 1} [${a.type || 'ISSUE'}] ${a.span ? `片段: ${a.span} | ` : ''}${a.advice || ''}`
            )
            .join('\n');

        const sourceText = i18n.getUserPrompt('source_text', { text: input.source || '' });
        const currentTranslation = i18n.getUserPrompt('current_translation', {
            text: input.target || '',
        });
        const suggestionsToApply = i18n.getUserPrompt('suggestions_to_apply', {
            suggestions: formatted || '(空)',
        });
        const taskInstruction = i18n.getUserPrompt('task_instruction');

        const userContent = `${userPref}${sourceText}\n\n${currentTranslation}\n\n${suggestionsToApply}\n\n${taskInstruction}`;
        const messages = this.messages(systemPrompt, userContent);
        return this.text(messages, { maxTokens: 1200 });
    }
}
