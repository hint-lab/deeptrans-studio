"use server";

import { SyntaxMarkerExtractAgent } from '@/agents';
import { SyntaxEvaluateAgent } from '@/agents';
import { SyntaxAdviceEmbedAgent } from '@/agents';

/**
 * 双语句法标记提取 Server Action
 */
export async function extractBilingualSyntaxMarkersAction(
  source: string,
  target: string,
  options?: { prompt?: string }
): Promise<any> {
  try {
    const agent = new SyntaxMarkerExtractAgent();
    const result = await agent.execute({
      source,
      target,
      prompt: options?.prompt
    });
    return result;
  } catch (error) {
    console.error('句法标记提取失败:', error);
    throw new Error('句法标记提取失败');
  }
}

/**
 * 句法评估 Server Action
 */
export async function evaluateSyntaxAction(
  source: string,
  target: string,
  options?: {
    targetLanguage?: string;
    domain?: string;
    prompt?: string;
    locale?: string;
  }
): Promise<any> {
  try {
    const agent = new SyntaxEvaluateAgent(options?.targetLanguage, options?.domain, options?.locale);
    const result = await agent.execute({
      source,
      target,
      targetLanguage: options?.targetLanguage,
      domain: options?.domain,
      prompt: options?.prompt,
      locale: options?.locale
    }, {
      locale: options?.locale
    });
    return result;
  } catch (error) {
    console.error('句法评估失败:', error);
    throw new Error('句法评估失败');
  }
}

/**
 * 句法建议嵌入 Server Action
 */
export async function embedSyntaxAdviceAction(
  source: string,
  target: string,
  issues: Array<{ type?: string; span?: string; advice?: string }>,
  options?: { prompt?: string }
): Promise<string> {
  try {
    const agent = new SyntaxAdviceEmbedAgent();
    const result = await agent.execute({
      source,
      target,
      issues,
      prompt: options?.prompt
    });
    return result;
  } catch (error) {
    console.error('句法建议嵌入失败:', error);
    throw new Error('句法建议嵌入失败');
  }
}

/**
 * 完整质检流程 Server Action
 */
export async function runQualityAssureAction(
  sourceText: string,
  targetText: string,
  options?: {
    targetLanguage?: string;
    domain?: string;
    prompt?: string;
    projectId?: string;
    locale?: string;
  }
): Promise<{
  biTerm: any;
  syntax: any;
  syntaxEmbedded: string;
}> {
  try {
    // 1. 双语句法标记提取（相当于原来的双语术语评估）
    const biTerm = await extractBilingualSyntaxMarkersAction(sourceText, targetText, {
      prompt: options?.prompt
    });

    // 2. 句法评估
    const syntax = await evaluateSyntaxAction(sourceText, targetText, {
      targetLanguage: options?.targetLanguage,
      domain: options?.domain,
      prompt: options?.prompt,
      locale: options?.locale
    });

    // 3. 句法建议嵌入（生成改进的译文）
    const issues = syntax?.issues || [];
    const syntaxEmbedded = await embedSyntaxAdviceAction(sourceText, targetText, issues, {
      prompt: options?.prompt
    });

    return {
      biTerm,
      syntax,
      syntaxEmbedded
    };
  } catch (error) {
    console.error('质检流程失败:', error);
    throw new Error('质检流程失败');
  }
}
