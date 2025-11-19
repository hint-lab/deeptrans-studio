import { BaseAgent, type AgentRunContext } from '../base'
import { MemoryHit } from '../tools/memory'
import { createAgentI18n } from '../i18n'

export class DiscourseEvaluateAgent extends BaseAgent<{
  source: string;
  target?: string;
  references?: MemoryHit[];
  tenantId?: string;
  prompt?: string;
  locale?: string;
}, any> {

  constructor(locale?: string) {
    super({
      name: 'postedit:discourse-eval',
      role: 'discourse_evaluator',
      domain: 'discourse',
      specialty: '风格一致性分析',
      quality: 'review',
      locale: locale || 'zh'
    });
  }

  async execute(input: {
    source: string;
    target?: string;
    references?: MemoryHit[];
    tenantId?: string;
    prompt?: string;
    locale?: string;
  }, ctx?: AgentRunContext): Promise<any> {
    const locale = ctx?.locale || input.locale || this.locale;
    const i18n = await createAgentI18n(locale);

    // 构建系统提示词
    const systemPrompt = await this.buildPrompt('json', [
      i18n.getAgentPrompt('discourse_evaluate', 'expert_role'),
      i18n.getAgentPrompt('discourse_evaluate', 'evaluation_dimensions'),
      i18n.getAgentPrompt('discourse_evaluate', 'style_consistency'),
      i18n.getAgentPrompt('discourse_evaluate', 'terminology_consistency'),
      i18n.getAgentPrompt('discourse_evaluate', 'word_choice_accuracy'),
      i18n.getAgentPrompt('discourse_evaluate', 'output_format'),
      i18n.getAgentPrompt('discourse_evaluate', 'style_match_score'),
      i18n.getAgentPrompt('discourse_evaluate', 'style_comments'),
      i18n.getAgentPrompt('discourse_evaluate', 'consistency_score'),
      i18n.getAgentPrompt('discourse_evaluate', 'consistency_comments'),
      i18n.getAgentPrompt('discourse_evaluate', 'word_choice_score'),
      i18n.getAgentPrompt('discourse_evaluate', 'word_choice_comments'),
      i18n.getAgentPrompt('discourse_evaluate', 'overall_score'),
      i18n.getAgentPrompt('discourse_evaluate', 'recommendations'),
      i18n.getAgentPrompt('discourse_evaluate', 'format_end')
    ]);

    // 如果用户提供了选择的参考翻译，使用用户选择的；否则使用所有查询结果
    const contextHits = input.references || [];

    const sourceText = i18n.getUserPrompt('source_text', { text: input.source || '' });
    const targetText = i18n.getUserPrompt('target_text', { text: input.target || '' });
    const currentTask = i18n.getAgentPrompt('discourse_evaluate', 'current_task');

    if (contextHits.length === 0) {
      // 如果没有参考语段，只能做基础评估
      const noReferenceNote = i18n.getAgentPrompt('discourse_evaluate', 'no_reference_note');
      const userContent = `${currentTask}\n${sourceText}\n${targetText}\n\n${noReferenceNote}`;
      const messages = this.messages(systemPrompt, userContent);
      return this.json(messages, { maxTokens: 1200 });
    }

    // 构建用户选择的参考语段上下文
    const selectedReferences = i18n.getAgentPrompt('discourse_evaluate', 'selected_references');
    const context = `${selectedReferences}\n${contextHits.map((h, i) =>
      `${i + 1}. ${i18n.getAgentPrompt('discourse_evaluate', 'similarity', { score: Math.round(h.score * 100).toString() })}\n   ${i18n.getUserPrompt('source_text', { text: h.source })}\n   ${i18n.getUserPrompt('target_text', { text: h.target })}`
    ).join('\n\n')}`;

    const evaluationInstruction = i18n.getAgentPrompt('discourse_evaluate', 'evaluation_instruction');
    const userContent = `${context}\n\n${currentTask}\n${sourceText}\n${targetText}\n\n${evaluationInstruction}`;

    const messages = this.messages(systemPrompt, userContent);
    return this.json(messages, { maxTokens: 1200 });
  }
}


