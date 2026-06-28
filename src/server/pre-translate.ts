import { DictLookupAgent, MonoTermExtractAgent, TermEmbedTranslateAgent } from '@/agents';
import type { AuthContext } from '@/lib/guards';
import { createLogger } from '@/lib/logger';
import type { DictEntry, TermCandidate } from '@/types/terms';

const logger = createLogger(
    {
        type: 'server:pre-translate',
    },
    {
        json: false,
        pretty: false,
        colors: true,
        includeCaller: false,
    }
);

export async function extractMonolingualTerms(
    text: string,
    options?: { prompt?: string; locale?: string }
): Promise<TermCandidate[]> {
    const agent = new MonoTermExtractAgent(options?.locale);
    return agent.execute(
        {
            text,
            prompt: options?.prompt,
            locale: options?.locale,
        },
        {
            locale: options?.locale,
        }
    );
}

export async function lookupDictionaryForOwner(
    terms: TermCandidate[],
    owner: AuthContext
): Promise<DictEntry[]> {
    const agent = new DictLookupAgent();
    return agent.execute({ terms, owner });
}

export async function baselineTranslate(
    text: string,
    sourceLanguage?: string,
    targetLanguage?: string,
    options?: { prompt?: string }
): Promise<string> {
    const agent = new TermEmbedTranslateAgent(sourceLanguage, targetLanguage);
    return agent.execute({
        text,
        sourceLanguage,
        targetLanguage,
        dict: undefined,
        prompt: options?.prompt,
    });
}

export async function embedAndTranslate(
    text: string,
    sourceLanguage?: string,
    targetLanguage?: string,
    dict?: DictEntry[],
    options?: { prompt?: string; locale?: string }
): Promise<string> {
    const agent = new TermEmbedTranslateAgent(sourceLanguage, targetLanguage, options?.locale);
    return agent.execute(
        {
            text,
            sourceLanguage,
            targetLanguage,
            dict,
            prompt: options?.prompt,
            locale: options?.locale,
        },
        {
            locale: options?.locale,
        }
    );
}

export async function runPreTranslateForOwner(
    sourceText: string,
    sourceLanguage: string | undefined,
    targetLanguage: string | undefined,
    owner: AuthContext,
    options?: { prompt?: string }
): Promise<{
    terms: TermCandidate[];
    dict: DictEntry[];
    translation: string;
}> {
    if (!owner.userId) throw new Error('缺少内部用户身份');

    try {
        logger.debug('预翻译流程开始:', {
            sourceChars: sourceText?.length || 0,
            sourceLanguage,
            targetLanguage,
            hasPrompt: !!options?.prompt,
        });

        const terms = await extractMonolingualTerms(sourceText, {
            prompt: options?.prompt,
        });
        logger.debug('术语抽取完成:', { count: terms?.length, terms: terms?.slice(0, 5) });

        const dict = await lookupDictionaryForOwner(terms, owner);
        logger.debug('词典查询完成:', { count: dict?.length });

        const translation = await embedAndTranslate(
            sourceText,
            sourceLanguage,
            targetLanguage,
            dict,
            { prompt: options?.prompt }
        );
        logger.debug('术语嵌入翻译完成:', { translationLength: translation?.length });

        return {
            terms,
            dict,
            translation,
        };
    } catch (error) {
        logger.error('预翻译流程失败:', error);
        throw new Error('预翻译流程失败');
    }
}
