import assert from 'node:assert/strict';
import test from 'node:test';

import { getExplorerDisclosureAction } from './explorer-tree-keyboard';

test('expands collapsed explorer rows with ArrowRight', () => {
    assert.equal(
        getExplorerDisclosureAction('ArrowRight', { hasChildren: true, isExpanded: false }),
        'expand'
    );
});

test('collapses expanded explorer rows with ArrowLeft', () => {
    assert.equal(
        getExplorerDisclosureAction('ArrowLeft', { hasChildren: true, isExpanded: true }),
        'collapse'
    );
});

test('does not intercept irrelevant keys or leaf rows', () => {
    assert.equal(
        getExplorerDisclosureAction('Enter', { hasChildren: true, isExpanded: false }),
        null
    );
    assert.equal(
        getExplorerDisclosureAction('ArrowRight', { hasChildren: false, isExpanded: false }),
        null
    );
    assert.equal(
        getExplorerDisclosureAction('ArrowLeft', { hasChildren: true, isExpanded: false }),
        null
    );
});
