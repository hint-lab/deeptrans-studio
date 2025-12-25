import { BaseAgent, type AgentRunContext } from '../base';
import { createAgentI18n } from '../i18n';

export class SyntaxMarkerExtractAgent extends BaseAgent<
    { source: string; target: string; prompt?: string; locale?: string },
    any
> {
    constructor(locale?: string) {
        super({
            name: 'qa:bilingual-syntax-marker-extract',
            role: 'syntax_analyzer',
            domain: 'linguistics',
            specialty: '句法对比分析', // This will be replaced by i18n
            quality: 'review',
            locale: locale || 'zh',
        });
    }

    async execute(
        input: { source: string; target: string; prompt?: string; locale?: string },
        ctx?: AgentRunContext
    ): Promise<any> {
        const locale = ctx?.locale || input.locale || this.locale;
        const i18n = await createAgentI18n(locale);

        // 构建系统提示词
        const systemPrompt = await this.buildPrompt('json', [
            i18n.getAgentPrompt('syntax_marker_extract', 'output_format'),
            i18n.getAgentPrompt('syntax_marker_extract', 'marker_types'),
            i18n.getAgentPrompt('syntax_marker_extract', 'alignment_accuracy'),
            i18n.getAgentPrompt('syntax_marker_extract', 'focus_connectors'),
        ]);

        const userPref = await this.buildUserPref(input.prompt);
        const sourceText = i18n.getUserPrompt('source_text', { text: input.source || '' });
        const targetText = i18n.getUserPrompt('target_text', { text: input.target || '' });
        const taskInstruction = i18n.getAgentPrompt('syntax_marker_extract', 'task_instruction');
        const identifyMarkers = i18n.getAgentPrompt('syntax_marker_extract', 'identify_markers');
        const establishCorrespondence = i18n.getAgentPrompt(
            'syntax_marker_extract',
            'establish_correspondence'
        );
        const evaluateAccuracy = i18n.getAgentPrompt('syntax_marker_extract', 'evaluate_accuracy');
        const annotateTypes = i18n.getAgentPrompt('syntax_marker_extract', 'annotate_types');
        const overallQuality = i18n.getAgentPrompt('syntax_marker_extract', 'overall_quality');

        const userContent = `${userPref}${sourceText}\n\n${targetText}\n\n${taskInstruction}\n${identifyMarkers}\n${establishCorrespondence}\n${evaluateAccuracy}\n${annotateTypes}\n${overallQuality}`;
        const messages = this.messages(systemPrompt, userContent);
        return this.json(messages, { maxTokens: 900 });
    }
}
