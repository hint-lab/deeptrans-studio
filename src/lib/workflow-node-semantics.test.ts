import assert from 'node:assert/strict';
import test from 'node:test';
import { getWorkflowNodeSemantics } from './workflow-node-semantics';

test('a known prompt key makes a workflow node configurable', () => {
    assert.deepEqual(
        getWorkflowNodeSemantics({ label: 'Term extraction', promptKey: 'mono-term-extract' }),
        {
            kind: 'prompt',
            promptKey: 'mono-term-extract',
            isPromptConfigurable: true,
            isReference: false,
        }
    );
});

test('reference nodes remain non-configurable even if a prompt key is accidentally supplied', () => {
    assert.deepEqual(
        getWorkflowNodeSemantics({
            label: 'Dictionary query',
            nodeKind: 'reference',
            promptKey: 'mono-term-extract',
        }),
        {
            kind: 'reference',
            promptKey: undefined,
            isPromptConfigurable: false,
            isReference: true,
        }
    );
});

test('unknown nodes do not expose a prompt configuration affordance', () => {
    assert.deepEqual(
        getWorkflowNodeSemantics({ label: 'Unmapped step', promptKey: 'dict-lookup' }),
        {
            kind: 'static',
            promptKey: undefined,
            isPromptConfigurable: false,
            isReference: false,
        }
    );
});
