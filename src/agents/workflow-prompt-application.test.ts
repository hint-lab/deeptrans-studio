import assert from 'node:assert/strict';
import test from 'node:test';
import { DiscourseEmbedAgent } from './postedit/DiscourseEmbedAgent';
import { DiscourseEvaluateAgent } from './postedit/DiscourseEvaluateAgent';
import { MonoTermExtractAgent } from './pre-translate/MonoTermExtractAgent';
import { TermEmbedTranslateAgent } from './pre-translate/TermEmbedTranslateAgent';
import { SyntaxAdviceEmbedAgent } from './qa/SyntaxAdviceEmbedAgent';
import { SyntaxEvaluateAgent } from './qa/SyntaxEvaluateAgent';
import { SyntaxMarkerExtractAgent } from './qa/SyntaxMarkerExtractAgent';

type AgentMessage = { role: 'system' | 'user' | 'assistant'; content: string };
type LlmOptions = { maxTokens?: number; timeoutMs?: number };

const personalInstruction = 'PERSONAL_PROMPT_MUST_REACH_THIS_AGENT';

function assertPromptReachedUserMessage(messages: AgentMessage[] | undefined) {
    assert.ok(messages, 'agent should construct messages before issuing an LLM request');
    assert.equal(messages.length, 2);
    assert.equal(messages[0]?.role, 'system');
    assert.equal(messages[1]?.role, 'user');
    assert.doesNotMatch(messages[0]?.content || '', new RegExp(personalInstruction));
    assert.match(messages[1]?.content || '', new RegExp(personalInstruction));
}

class CapturingMonoTermExtractAgent extends MonoTermExtractAgent {
    messagesSeen?: AgentMessage[];

    protected override async json<T = any>(
        messages: AgentMessage[],
        _opts?: LlmOptions
    ): Promise<T> {
        this.messagesSeen = messages;
        return [] as T;
    }
}

class CapturingTermEmbedTranslateAgent extends TermEmbedTranslateAgent {
    messagesSeen?: AgentMessage[];

    protected override async text(messages: AgentMessage[], _opts?: LlmOptions): Promise<string> {
        this.messagesSeen = messages;
        return 'translated';
    }
}

class CapturingSyntaxMarkerExtractAgent extends SyntaxMarkerExtractAgent {
    messagesSeen?: AgentMessage[];

    protected override async json<T = any>(
        messages: AgentMessage[],
        _opts?: LlmOptions
    ): Promise<T> {
        this.messagesSeen = messages;
        return {} as T;
    }
}

class CapturingSyntaxEvaluateAgent extends SyntaxEvaluateAgent {
    messagesSeen?: AgentMessage[];

    protected override async json<T = any>(
        messages: AgentMessage[],
        _opts?: LlmOptions
    ): Promise<T> {
        this.messagesSeen = messages;
        return {} as T;
    }
}

class CapturingSyntaxAdviceEmbedAgent extends SyntaxAdviceEmbedAgent {
    messagesSeen?: AgentMessage[];

    protected override async text(messages: AgentMessage[], _opts?: LlmOptions): Promise<string> {
        this.messagesSeen = messages;
        return 'revised';
    }
}

class CapturingDiscourseEvaluateAgent extends DiscourseEvaluateAgent {
    messagesSeen?: AgentMessage[];

    protected override async json<T = any>(
        messages: AgentMessage[],
        _opts?: LlmOptions
    ): Promise<T> {
        this.messagesSeen = messages;
        return {} as T;
    }
}

class CapturingDiscourseEmbedAgent extends DiscourseEmbedAgent {
    messagesSeen?: AgentMessage[];

    protected override async text(messages: AgentMessage[], _opts?: LlmOptions): Promise<string> {
        this.messagesSeen = messages;
        return 'rewritten';
    }
}

test('every configurable workflow agent places the personal instruction in its user layer', async () => {
    const termExtract = new CapturingMonoTermExtractAgent();
    await termExtract.execute({ text: '甲方应付款。', prompt: personalInstruction });
    assertPromptReachedUserMessage(termExtract.messagesSeen);

    const translate = new CapturingTermEmbedTranslateAgent('zh', 'en');
    await translate.execute({
        text: '甲方应付款。',
        sourceLanguage: 'zh',
        targetLanguage: 'en',
        prompt: personalInstruction,
    });
    assertPromptReachedUserMessage(translate.messagesSeen);

    // The QA diagram exposes the same personal prompt for both the marker
    // extraction and structured syntax evaluation nodes.
    const markerExtract = new CapturingSyntaxMarkerExtractAgent();
    await markerExtract.execute({
        source: '甲方应付款。',
        target: 'Party A shall pay.',
        prompt: personalInstruction,
    });
    assertPromptReachedUserMessage(markerExtract.messagesSeen);

    const syntaxEvaluate = new CapturingSyntaxEvaluateAgent('en', 'legal');
    await syntaxEvaluate.execute({
        source: '甲方应付款。',
        target: 'Party A shall pay.',
        targetLanguage: 'en',
        domain: 'legal',
        prompt: personalInstruction,
    });
    assertPromptReachedUserMessage(syntaxEvaluate.messagesSeen);

    const syntaxAdvice = new CapturingSyntaxAdviceEmbedAgent();
    await syntaxAdvice.execute({
        source: '甲方应付款。',
        target: 'Party A will pay.',
        issues: [],
        prompt: personalInstruction,
    });
    assertPromptReachedUserMessage(syntaxAdvice.messagesSeen);

    const discourseEvaluate = new CapturingDiscourseEvaluateAgent();
    await discourseEvaluate.execute({
        source: '甲方应付款。',
        target: 'Party A shall pay.',
        references: [],
        prompt: personalInstruction,
    });
    assertPromptReachedUserMessage(discourseEvaluate.messagesSeen);

    const discourseEmbed = new CapturingDiscourseEmbedAgent();
    await discourseEmbed.execute({
        source: '甲方应付款。',
        target: 'Party A shall pay.',
        references: [
            {
                id: 'reference-1',
                source: '乙方应交付。',
                target: 'Party B shall deliver.',
                score: 0.9,
            },
        ],
        prompt: personalInstruction,
    });
    assertPromptReachedUserMessage(discourseEmbed.messagesSeen);
});
