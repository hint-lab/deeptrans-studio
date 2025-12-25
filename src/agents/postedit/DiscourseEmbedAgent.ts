import { BaseAgent, type AgentRunContext } from '../base';
import { MemoryHit } from '../tools/memory';
import { createAgentI18n } from '../i18n';

export class DiscourseEmbedAgent extends BaseAgent<
    {
        source: string;
        target: string;
        references: MemoryHit[];
        tenantId?: string;
        prompt?: string;
        locale?: string;
    },
    string
> {
    constructor(locale?: string) {
        super({
            name: 'postedit:discourse-embed-trans',
            role: 'post_editor',
            domain: 'discourse',
            specialty: '风格嵌入与改写', // This will be replaced by i18n
            quality: 'final',
            locale: locale || 'zh',
        });
    }

    async execute(
        input: {
            source: string;
            target: string;
            references: MemoryHit[];
            tenantId?: string;
            prompt?: string;
            locale?: string;
        },
        ctx?: AgentRunContext
    ): Promise<string> {
        const locale = ctx?.locale || input.locale || this.locale;
        const i18n = await createAgentI18n(locale);

        if (!input.references || input.references.length === 0) {
            // 如果没有用户选择的参考翻译，返回原译文
            return input.target;
        }

        // 构建系统提示词
        const systemPrompt = await this.buildPrompt('text', [
            i18n.getAgentPrompt('discourse_embed', 'expert_role'),
            i18n.getAgentPrompt('discourse_embed', 'task_requirements'),
            i18n.getAgentPrompt('discourse_embed', 'analyze_style'),
            i18n.getAgentPrompt('discourse_embed', 'identify_inconsistencies'),
            i18n.getAgentPrompt('discourse_embed', 'minimal_changes'),
            i18n.getAgentPrompt('discourse_embed', 'ensure_terminology'),
            i18n.getAgentPrompt('discourse_embed', 'optimize_wording'),
            '',
            i18n.getAgentPrompt('discourse_embed', 'notes'),
            i18n.getAgentPrompt('discourse_embed', 'preserve_meaning'),
            i18n.getAgentPrompt('discourse_embed', 'prioritize_terminology'),
            i18n.getAgentPrompt('discourse_embed', 'natural_style'),
            i18n.getAgentPrompt('discourse_embed', 'output_only'),
        ]);

        // 构建用户选择的参考翻译上下文
        const context = `${i18n.getAgentPrompt('discourse_embed', 'selected_references_style')}\n${input.references
            .map(
                (ref, i) =>
                    `${i + 1}. ${i18n.getAgentPrompt('discourse_evaluate', 'similarity', { score: Math.round(ref.score * 100).toString() })}\n   ${i18n.getUserPrompt('source_text', { text: ref.source })}\n   ${i18n.getUserPrompt('target_text', { text: ref.target })}`
            )
            .join('\n\n')}`;

        const sourceText = i18n.getUserPrompt('source_text', { text: input.source });
        const currentTranslation = i18n.getAgentPrompt('discourse_embed', 'current_translation', {
            text: input.target,
        });
        const currentTask = i18n.getAgentPrompt('discourse_embed', 'current_task');
        const optimizationInstruction = i18n.getAgentPrompt(
            'discourse_embed',
            'optimization_instruction'
        );
        const preserveOriginalMeaning = i18n.getAgentPrompt(
            'discourse_embed',
            'preserve_original_meaning'
        );
        const learnReferenceStyle = i18n.getAgentPrompt('discourse_embed', 'learn_reference_style');
        const ensureTermConsistency = i18n.getAgentPrompt(
            'discourse_embed',
            'ensure_term_consistency'
        );
        const makeNatural = i18n.getAgentPrompt('discourse_embed', 'make_natural');
        const outputInstruction = i18n.getAgentPrompt('discourse_embed', 'output_instruction');

        const userContent = `${context}\n\n${currentTask}\n${sourceText}\n${currentTranslation}\n\n${optimizationInstruction}\n${preserveOriginalMeaning}\n${learnReferenceStyle}\n${ensureTermConsistency}\n${makeNatural}\n\n${outputInstruction}`;

        const messages = this.messages(systemPrompt, userContent);
        return this.text(messages, { maxTokens: 800 });
    }
}
