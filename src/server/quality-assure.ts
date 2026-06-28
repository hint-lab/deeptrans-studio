import { SyntaxAdviceEmbedAgent, SyntaxEvaluateAgent, SyntaxMarkerExtractAgent } from '@/agents';
import type { AuthContext } from '@/lib/guards';
import { createLogger } from '@/lib/logger';

const logger = createLogger(
    {
        type: 'server:quality-assure',
    },
    {
        json: false,
        pretty: false,
        colors: true,
        includeCaller: false,
    }
);

export async function extractBilingualSyntaxMarkers(
    source: string,
    target: string,
    options?: { prompt?: string }
) {
    const agent = new SyntaxMarkerExtractAgent();
    return agent.execute({
        source,
        target,
        prompt: options?.prompt,
    });
}

export async function evaluateSyntax(
    source: string,
    target: string,
    options?: {
        targetLanguage?: string;
        domain?: string;
        prompt?: string;
        locale?: string;
    }
) {
    const agent = new SyntaxEvaluateAgent(options?.targetLanguage, options?.domain, options?.locale);
    return agent.execute(
        {
            source,
            target,
            targetLanguage: options?.targetLanguage,
            domain: options?.domain,
            prompt: options?.prompt,
            locale: options?.locale,
        },
        {
            locale: options?.locale,
        }
    );
}

export async function embedSyntaxAdvice(
    source: string,
    target: string,
    issues: Array<{ type?: string; span?: string; advice?: string }>,
    options?: { prompt?: string }
) {
    const agent = new SyntaxAdviceEmbedAgent();
    return agent.execute({
        source,
        target,
        issues,
        prompt: options?.prompt,
    });
}

export async function runQualityAssureForOwner(
    sourceText: string,
    targetText: string,
    owner: AuthContext,
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
    if (!owner.userId) throw new Error('缺少内部用户身份');

    try {
        const biTerm = await extractBilingualSyntaxMarkers(sourceText, targetText, {
            prompt: options?.prompt,
        });

        const syntax = await evaluateSyntax(sourceText, targetText, {
            targetLanguage: options?.targetLanguage,
            domain: options?.domain,
            prompt: options?.prompt,
            locale: options?.locale,
        });

        const issues = syntax?.issues || [];
        const syntaxEmbedded = await embedSyntaxAdvice(sourceText, targetText, issues, {
            prompt: options?.prompt,
        });

        return {
            biTerm,
            syntax,
            syntaxEmbedded,
        };
    } catch (error) {
        logger.error('质检流程失败:', error);
        throw new Error('质检流程失败');
    }
}
