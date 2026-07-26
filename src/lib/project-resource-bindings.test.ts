import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
    canSaveProjectResourceBindings,
    resolveProjectResourceBindings,
} from './project-resource-bindings';

const mapResource = (value: unknown) => {
    if (!value || typeof value !== 'object') return null;
    const candidate = value as { id?: unknown; name?: unknown };
    return typeof candidate.id === 'string' && typeof candidate.name === 'string'
        ? { id: candidate.id, name: candidate.name }
        : null;
};

test('does not mark a dialog ready when resources or existing bindings fail to load', () => {
    assert.deepEqual(
        resolveProjectResourceBindings(
            { success: false, error: 'resources unavailable' },
            { success: true, data: ['bound-memory'] },
            mapResource,
            'Unable to load project resources'
        ),
        { success: false, error: 'Unable to load project resources' }
    );
    assert.deepEqual(
        resolveProjectResourceBindings(
            { success: true, data: [{ id: 'memory-1', name: 'Legal memory' }] },
            { success: false },
            mapResource,
            'Unable to load project resources'
        ),
        { success: false, error: 'Unable to load project resources' }
    );
});

test('recognizes an empty collection only after both load responses succeed', () => {
    assert.deepEqual(
        resolveProjectResourceBindings(
            { success: true, data: [] },
            { success: true, data: [] },
            mapResource,
            'Unable to load project resources'
        ),
        { success: true, items: [], selected: [] }
    );
});

test('keeps save disabled until a successful initial load completes', () => {
    assert.equal(canSaveProjectResourceBindings('idle', false), false);
    assert.equal(canSaveProjectResourceBindings('loading', false), false);
    assert.equal(canSaveProjectResourceBindings('error', false), false);
    assert.equal(canSaveProjectResourceBindings('ready', true), false);
    assert.equal(canSaveProjectResourceBindings('ready', false), true);
});

test('both resource dialogs use the readiness guard instead of treating loading as empty', () => {
    const componentSource = fs.readFileSync(
        path.join(
            process.cwd(),
            'src',
            'app',
            '(app)',
            'dashboard',
            'components',
            'project-resource-dialogs.tsx'
        ),
        'utf8'
    );

    assert.match(
        componentSource,
        /const canSave = canSaveProjectResourceBindings\(loadState, saving\)/
    );
    assert.match(componentSource, /loadState === 'loading'/);
    assert.match(componentSource, /loadState === 'ready' && !items\.length/);
    assert.match(componentSource, /<Button onClick=\{handleSave\} disabled=\{!canSave\}>/);
});

test('memory resource configuration discloses inaccessible legacy bindings instead of hiding them', () => {
    const componentSource = fs.readFileSync(
        path.join(
            process.cwd(),
            'src',
            'app',
            '(app)',
            'dashboard',
            'components',
            'project-resource-dialogs.tsx'
        ),
        'utf8'
    );

    assert.match(componentSource, /inaccessibleBindingCount/);
    assert.match(componentSource, /memoryRetrievalScopeNotice/);
    assert.match(componentSource, /legacyMemoryBindingNotice/);
});

test('resource binding dialogs do not serialize thrown server errors into the UI', () => {
    const componentSource = fs.readFileSync(
        path.join(
            process.cwd(),
            'src',
            'app',
            '(app)',
            'dashboard',
            'components',
            'project-resource-dialogs.tsx'
        ),
        'utf8'
    );

    assert.match(componentSource, /function failureMessage\(_error: unknown, fallback: string\)/);
    assert.doesNotMatch(componentSource, /error instanceof Error && error\.message/);
});
