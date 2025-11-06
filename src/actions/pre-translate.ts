"use server";

import { MonoTermExtractAgent } from '@/agents';
import { DictLookupAgent } from '@/agents';
import { TermEmbedTranslateAgent } from '@/agents';
import type { TermCandidate, DictEntry } from '@/types/terms';

/**
 * 术语抽取 Server Action
 */
export async function extractMonolingualTermsAction(
  text: string,
  options?: { prompt?: string; locale?: string }
): Promise<TermCandidate[]> {
  try {
    const agent = new MonoTermExtractAgent(options?.locale);
    const result = await agent.execute({
      text,
      prompt: options?.prompt,
      locale: options?.locale
    }, {
      locale: options?.locale
    });
    return result;
  } catch (error) {
    console.error('术语抽取失败:', error);
    throw new Error('术语抽取失败');
  }
}

/**
 * 词典查询 Server Action
 */
export async function lookupDictionaryAction(
  terms: TermCandidate[],
  options?: { tenantId?: string; userId?: string }
): Promise<DictEntry[]> {
  try {
    console.log('词典查询 Action 开始:', {
      termsCount: terms?.length,
      terms: terms?.map(t => t.term).slice(0, 10),
      options
    });

    const agent = new DictLookupAgent();
    const result = await agent.execute({
      terms,
      tenantId: options?.tenantId,
      userId: options?.userId
    });

    console.log('词典查询 Action 完成:', {
      resultCount: result?.length,
      result: result?.slice(0, 3)
    });

    return result;
  } catch (error) {
    console.error('词典查询失败:', error);
    throw new Error('词典查询失败');
  }
}

/**
 * 基线翻译 Server Action - 简单的大模型翻译，不涉及术语处理
 */
export async function baselineTranslateAction(
  text: string,
  sourceLanguage?: string,
  targetLanguage?: string,
  options?: { prompt?: string }
): Promise<string> {
  try {
    const agent = new TermEmbedTranslateAgent(sourceLanguage, targetLanguage);
    const result = await agent.execute({
      text,
      sourceLanguage,
      targetLanguage,
      // 不传入词典，实现简单翻译
      dict: undefined,
      prompt: options?.prompt
    });
    return result;
  } catch (error) {
    console.error('基线翻译失败:', error);
    throw new Error('基线翻译失败');
  }
}

/**
 * 术语嵌入翻译 Server Action
 */
export async function embedAndTranslateAction(
  text: string,
  sourceLanguage?: string,
  targetLanguage?: string,
  dict?: DictEntry[],
  options?: { prompt?: string; locale?: string }
): Promise<string> {
  try {
    const agent = new TermEmbedTranslateAgent(sourceLanguage, targetLanguage, options?.locale);
    const result = await agent.execute({
      text,
      sourceLanguage,
      targetLanguage,
      dict,
      prompt: options?.prompt,
      locale: options?.locale
    }, {
      locale: options?.locale
    });
    return result;
  } catch (error) {
    console.error('术语嵌入翻译失败:', error);
    throw new Error('术语嵌入翻译失败');
  }
}


/**
 * 完整预翻译流程 Server Action
 */
export async function runPreTranslateAction(
  sourceText: string,
  sourceLanguage?: string,
  targetLanguage?: string,
  options?: {
    prompt?: string;
    tenantId?: string;
    userId?: string;
  }
): Promise<{
  terms: TermCandidate[];
  dict: DictEntry[];
  translation: string;
}> {
  try {
    console.log('预翻译流程开始:', {
      sourceText: sourceText?.substring(0, 100) + (sourceText?.length > 100 ? '...' : ''),
      sourceLanguage,
      targetLanguage,
      options
    });

    // 1. 术语抽取
    console.log('步骤 1: 开始术语抽取...');
    const terms = await extractMonolingualTermsAction(sourceText, {
      prompt: options?.prompt
    });
    console.log('术语抽取完成:', { count: terms?.length, terms: terms?.slice(0, 5) });

    // 2. 词典查询
    console.log('步骤 2: 开始词典查询...', { termsCount: terms?.length });
    const dict = await lookupDictionaryAction(terms, {
      tenantId: options?.tenantId,
      userId: options?.userId
    });
    console.log('词典查询完成:', { count: dict?.length, dict: dict?.slice(0, 3) });

    // 3. 术语嵌入翻译
    console.log('步骤 3: 开始术语嵌入翻译...', { dictCount: dict?.length });
    const translation = await embedAndTranslateAction(
      sourceText,
      sourceLanguage,
      targetLanguage,
      dict,
      { prompt: options?.prompt }
    );
    console.log('术语嵌入翻译完成:', { translationLength: translation?.length });

    const result = {
      terms,
      dict,
      translation
    };

    console.log('预翻译流程完成:', {
      termsCount: terms?.length,
      dictCount: dict?.length,
      translationLength: translation?.length
    });

    return result;
  } catch (error) {
    console.error('预翻译流程失败:', error);
    throw new Error('预翻译流程失败');
  }
}

