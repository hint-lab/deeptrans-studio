import assert from 'node:assert/strict';
import test from 'node:test';

import { isCurrentProjectPostEditItem } from './post-edit-project-scope';

const documentTabs = [{ id: 'document-a', items: [{ id: 'segment-a' }] }];

test('does not render an old active segment while Explorer is switching projects', () => {
    assert.equal(
        isCurrentProjectPostEditItem({
            routeProjectId: 'project-b',
            explorerProjectId: 'project-a',
            activeItemId: 'segment-a',
            documentTabs,
        }),
        false
    );
});

test('accepts a segment only after Explorer confirms it belongs to the route project', () => {
    assert.equal(
        isCurrentProjectPostEditItem({
            routeProjectId: 'project-a',
            explorerProjectId: 'project-a',
            activeItemId: 'segment-a',
            documentTabs,
        }),
        true
    );
    assert.equal(
        isCurrentProjectPostEditItem({
            routeProjectId: 'project-a',
            explorerProjectId: 'project-a',
            activeItemId: 'segment-b',
            documentTabs,
        }),
        false
    );
});
