import { BaseAgent, type AgentRunContext } from '../base';
import { createAgentI18n } from '../i18n';
import {
    collectSyntaxCueHints,
    normalizeSyntaxQualityResult,
    type SyntaxQualityResult,
} from '@/lib/syntax-quality';

export class SyntaxEvaluateAgent extends BaseAgent<
    {
        source: string;
        target: string;
        targetLanguage?: string;
        domain?: string;
        prompt?: string;
        locale?: string;
    },
    SyntaxQualityResult
> {
    constructor(targetLanguage?: string, domain?: string, locale?: string) {
        super({
            name: 'qa:syntax-evaluate',
            role: 'syntax_evaluator',
            domain: domain || 'linguistics',
            targetLanguage: targetLanguage || 'zh',
            specialty: '句法评估',
            quality: 'review',
            locale: locale || 'zh',
        });
    }

    async execute(
        input: {
            source: string;
            target: string;
            targetLanguage?: string;
            domain?: string;
            prompt?: string;
            locale?: string;
        },
        ctx?: AgentRunContext
    ): Promise<SyntaxQualityResult> {
        // 使用上下文中的locale或输入中的locale
        const locale = ctx?.locale || input.locale || this.locale;
        const i18n = await createAgentI18n(locale);

        // 构建系统提示词
        const systemPrompt = await this.buildPrompt('json', [
            i18n.getAgentPrompt('syntax_evaluate', 'output_format'),
            i18n.getAgentPrompt('syntax_evaluate', 'type_options'),
            i18n.getAgentPrompt('syntax_evaluate', 'relation_rules'),
            i18n.getAgentPrompt('syntax_evaluate', 'severity_rules'),
            i18n.getAgentPrompt('syntax_evaluate', 'review_boundary'),
        ]);

        // 构建用户提示词
        const userPref = await this.buildUserPref(input.prompt);
        const lang = input?.targetLanguage
            ? i18n.getUserPrompt('target_language', { language: input.targetLanguage })
            : i18n.getUserPrompt('target_language', { language: 'unspecified' });
        const dom = input?.domain
            ? i18n.getUserPrompt('domain', { domain: input.domain })
            : i18n.getUserPrompt('domain', { domain: 'general' });

        const sourceText = i18n.getUserPrompt('source_text', { text: input.source || '' });
        const targetText = i18n.getUserPrompt('target_text', { text: input.target || '' });
        const focus = i18n.getAgentPrompt('syntax_evaluate', 'focus');
        const cues = collectSyntaxCueHints(input.source || '', input.target || '');
        const cueHints = i18n.getAgentPrompt('syntax_evaluate', 'cue_hints', {
            cues: JSON.stringify(cues),
        });

        const userContent = `${userPref}${lang}\n${dom}\n\n${sourceText}\n\n${targetText}\n\n${cueHints}\n${focus}`;
        const messages = this.messages(systemPrompt, userContent);
        const raw = await this.json(messages, { maxTokens: 2200 });
        return normalizeSyntaxQualityResult(raw);
    }
}
