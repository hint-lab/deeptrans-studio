import assert from 'node:assert/strict';
import test from 'node:test';
import { WORKFLOW_PROMPT_KEYS } from '@/lib/workflow-prompt-keys';
import {
    canDismissPromptConfigSheet,
    getPromptConfigSheetState,
    isPromptConfigSettingsPayload,
} from './prompt-config-state';

test('prompt configuration sheet keeps request failure distinct from loading', () => {
    assert.equal(
        getPromptConfigSheetState({
            selectedKey: 'discourse-evaluate',
            hasSelectedSetting: false,
            loadState: 'loading',
        }),
        'loading'
    );
    assert.equal(
        getPromptConfigSheetState({
            selectedKey: 'discourse-evaluate',
            hasSelectedSetting: false,
            loadState: 'error',
        }),
        'error'
    );
});

test('prompt configuration sheet distinguishes no selection from a missing setting', () => {
    assert.equal(
        getPromptConfigSheetState({
            selectedKey: null,
            hasSelectedSetting: false,
            loadState: 'ready',
        }),
        'no-selection'
    );
    assert.equal(
        getPromptConfigSheetState({
            selectedKey: 'discourse-evaluate',
            hasSelectedSetting: false,
            loadState: 'ready',
        }),
        'missing'
    );
    assert.equal(
        getPromptConfigSheetState({
            selectedKey: 'discourse-evaluate',
            hasSelectedSetting: true,
            loadState: 'ready',
        }),
        'ready'
    );
});

function completeSettingsPayload() {
    return WORKFLOW_PROMPT_KEYS.map((nodeKey, index) => ({
        nodeKey,
        title: `Title ${index}`,
        description: `Description ${index}`,
        systemPrompt: `System ${index}`,
        content: '',
        enabled: true,
        version: 0,
        updatedAt: null,
        customized: false,
    }));
}

test('prompt configuration rejects malformed or incomplete settings payloads as load failures', () => {
    const valid = completeSettingsPayload();
    const first = valid[0];
    assert.ok(first);
    assert.equal(isPromptConfigSettingsPayload(valid), true);
    assert.equal(isPromptConfigSettingsPayload(valid.slice(1)), false);
    assert.equal(
        isPromptConfigSettingsPayload([
            ...valid.slice(0, -1),
            { ...first, nodeKey: first.nodeKey },
        ]),
        false
    );
    assert.equal(isPromptConfigSettingsPayload({ settings: valid }), false);
});

test('the Sheet cannot dismiss a prompt while a save or reset request is in flight', () => {
    assert.equal(canDismissPromptConfigSheet(false), true);
    assert.equal(canDismissPromptConfigSheet(true), false);
});
