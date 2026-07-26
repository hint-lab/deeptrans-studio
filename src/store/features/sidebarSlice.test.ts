import assert from 'node:assert/strict';
import test from 'node:test';
import sidebarReducer, { setOpen, toggle } from './sidebarSlice';

test('sidebar can be closed explicitly after a mobile navigation', () => {
    const opened = sidebarReducer(undefined, { type: 'init' });
    assert.equal(opened.isOpen, true);

    const closed = sidebarReducer(opened, setOpen(false));
    assert.equal(closed.isOpen, false);
    assert.equal(sidebarReducer(closed, toggle()).isOpen, true);
});
