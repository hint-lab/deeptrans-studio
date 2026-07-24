import { SyntaxAdviceEmbedAgent, SyntaxEvaluateAgent, SyntaxMarkerExtractAgent } from '@/agents';
import type { AuthContext } from '@/lib/guards';
import { createLogger } from '@/lib/logger';
import {
    buildSyntaxAlignmentResult,
    normalizeSyntaxQualityResult,
    type SyntaxIssue,
    type SyntaxQualityResult,
} from '@/lib/syntax-quality';
import { sourceRevision } from '@/lib/source-revision';
import { createSyntaxEvaluationId } from '@/lib/syntax-evaluation-id';

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
    const agent = new SyntaxEvaluateAgent(
        options?.targetLanguage,
        options?.domain,
        options?.locale
    );
    const result = await agent.execute(
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
    if (result.status !== 'complete' || result.legacy) {
        throw new Error(
            result.status === 'failed'
                ? 'SYNTAX_QA_INVALID_RESPONSE'
                : 'SYNTAX_QA_INCOMPLETE_RESPONSE'
        );
    }
    return result;
}

export async function embedSyntaxAdvice(
    source: string,
    target: string,
    issues: Array<Partial<SyntaxIssue> & { type?: string; span?: string }>,
    options?: { prompt?: string; locale?: string }
) {
    const agent = new SyntaxAdviceEmbedAgent(options?.locale);
    return agent.execute(
        {
            source,
            target,
            issues,
            prompt: options?.prompt,
            locale: options?.locale,
        },
        { locale: options?.locale }
    );
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
    syntaxEmbedded: null;
}> {
    if (!owner.userId) throw new Error('缺少内部用户身份');

    try {
        const evaluated = await evaluateSyntax(sourceText, targetText, {
            targetLanguage: options?.targetLanguage,
            domain: options?.domain,
            prompt: options?.prompt,
            locale: options?.locale,
        });
        const syntax: SyntaxQualityResult = {
            ...evaluated,
            evaluation: {
                id: createSyntaxEvaluationId(),
                sourceRevision: sourceRevision(sourceText),
                targetRevision: sourceRevision(targetText),
                baseSource: sourceText,
                baseTarget: targetText,
                embeddedIssueIds: [],
            },
        };
        const biTerm = buildSyntaxAlignmentResult(syntax);

        return {
            biTerm,
            syntax,
            syntaxEmbedded: null,
        };
    } catch (error) {
        logger.error('质检流程失败:', error);
        throw new Error('质检流程失败');
    }
}
