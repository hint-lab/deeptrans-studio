import { BaseAgent, type AgentRunContext } from '../base'
import { type DictEntry } from '@/types/terms'
import { createAgentI18n } from '../i18n'

export class TermEmbedTranslateAgent extends BaseAgent<{ text: string; sourceLanguage?: string; targetLanguage?: string; dict?: DictEntry[]; prompt?: string; locale?: string }, string> {
  constructor(sourceLanguage?: string, targetLanguage?: string, locale?: string) {
    super({
      name: 'term-embed-trans',
      role: 'professional_translator',
      sourceLanguage: sourceLanguage || 'auto',
      targetLanguage: targetLanguage || 'zh',
      quality: 'final',
      specialty: '术语嵌入翻译',
      locale: locale || 'zh'
    });
  }

  async execute(input: { text: string; sourceLanguage?: string; targetLanguage?: string; dict?: DictEntry[]; prompt?: string; locale?: string }, ctx?: AgentRunContext): Promise<string> {
    const locale = ctx?.locale || input.locale || this.locale;
    const i18n = await createAgentI18n(locale);

    const systemPrompt = await this.buildPrompt('text', [
      i18n.getAgentPrompt('term_embed_translate', 'apply_glossary'),
      i18n.getAgentPrompt('term_embed_translate', 'no_rewrite_glossary')
    ]);

    const glossary = await this.buildGlossary(input.dict);
    const userPref = await this.buildUserPref(input.prompt);
    const textToTranslate = i18n.getUserPrompt('text_to_translate', { text: input.text || '' });
    const userContent = `${glossary ? glossary + '\n\n' : ''}${userPref}${textToTranslate}`;

    const messages = this.messages(systemPrompt, userContent);
    return this.text(messages, { maxTokens: 2000 });
  }
}


