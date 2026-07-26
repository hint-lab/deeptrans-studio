import assert from 'node:assert/strict';
import test from 'node:test';

import {
    isIDEGlobalShortcutExcludedTarget,
    isEditableKeyboardTarget,
    normalizeKeyboardKey,
    shouldHandleIDEGlobalShortcut,
} from './keyboard-key';

const asEventTarget = (target: object) => target as unknown as EventTarget;
const shortcutEvent = (
    target: EventTarget | null,
    options: { metaKey?: boolean; ctrlKey?: boolean } = {}
) =>
    ({
        target,
        metaKey: options.metaKey ?? true,
        ctrlKey: options.ctrlKey ?? false,
    }) as Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'target'>;

test('normalizeKeyboardKey normalizes string keys', () => {
    assert.equal(normalizeKeyboardKey('K'), 'k');
    assert.equal(normalizeKeyboardKey('Escape'), 'escape');
    assert.equal(normalizeKeyboardKey('/'), '/');
});

test('normalizeKeyboardKey safely ignores missing or invalid keys', () => {
    assert.equal(normalizeKeyboardKey(undefined), '');
    assert.equal(normalizeKeyboardKey(null), '');
    assert.equal(normalizeKeyboardKey({}), '');
});

test('identifies native and rich-text editing targets for shortcut protection', () => {
    assert.equal(isEditableKeyboardTarget(asEventTarget({ tagName: 'INPUT' })), true);
    assert.equal(isEditableKeyboardTarget(asEventTarget({ tagName: 'textarea' })), true);
    assert.equal(isEditableKeyboardTarget(asEventTarget({ tagName: 'select' })), true);
    assert.equal(isEditableKeyboardTarget(asEventTarget({ isContentEditable: true })), true);
    assert.equal(
        isEditableKeyboardTarget(
            asEventTarget({
                closest: (selector: string) => (selector.includes('[role="textbox"]') ? {} : null),
            })
        ),
        true
    );
});

test('does not suppress shortcuts from ordinary controls or the workspace', () => {
    assert.equal(
        isEditableKeyboardTarget(
            asEventTarget({
                tagName: 'BUTTON',
                closest: () => null,
            })
        ),
        false
    );
    assert.equal(isEditableKeyboardTarget(null), false);
});

test('identifies Dialog, Menu, and Listbox surfaces as global-shortcut exclusions', () => {
    for (const role of ['dialog', 'menu', 'listbox']) {
        const nestedButton = asEventTarget({
            tagName: 'BUTTON',
            closest: (selector: string) => (selector.includes(`[role="${role}"]`) ? {} : null),
        });

        assert.equal(isIDEGlobalShortcutExcludedTarget(nestedButton), true);
    }

    const dialogParent = {
        getAttribute: (name: string) => (name === 'role' ? 'dialog' : null),
    };
    const buttonWithoutClosest = asEventTarget({
        tagName: 'BUTTON',
        parentElement: dialogParent,
    });
    assert.equal(isIDEGlobalShortcutExcludedTarget(buttonWithoutClosest), true);
});

test('allows a modifier shortcut in the workspace but protects focused editing', () => {
    const editor = asEventTarget({ tagName: 'TEXTAREA' });
    const workspaceButton = asEventTarget({ tagName: 'BUTTON', closest: () => null });

    assert.equal(shouldHandleIDEGlobalShortcut(shortcutEvent(editor), false), false);
    assert.equal(shouldHandleIDEGlobalShortcut(shortcutEvent(workspaceButton), false), true);
    assert.equal(
        shouldHandleIDEGlobalShortcut(shortcutEvent(workspaceButton, { metaKey: false }), false),
        false
    );
    assert.equal(shouldHandleIDEGlobalShortcut(shortcutEvent(workspaceButton), true), false);
});

test('blocks Cmd/Ctrl batch shortcuts from Dialog, Menu, and Listbox buttons', () => {
    for (const role of ['dialog', 'menu', 'listbox']) {
        const nestedButton = asEventTarget({
            tagName: 'BUTTON',
            closest: (selector: string) => (selector.includes(`[role="${role}"]`) ? {} : null),
        });

        assert.equal(
            shouldHandleIDEGlobalShortcut(shortcutEvent(nestedButton, { metaKey: true }), false),
            false,
            `Cmd+B/E/P must not escape a ${role}`
        );
        assert.equal(
            shouldHandleIDEGlobalShortcut(
                shortcutEvent(nestedButton, { metaKey: false, ctrlKey: true }),
                false
            ),
            false,
            `Ctrl+B/E/P must not escape a ${role}`
        );
    }

    const workspaceButton = asEventTarget({ tagName: 'BUTTON', closest: () => null });
    assert.equal(shouldHandleIDEGlobalShortcut(shortcutEvent(workspaceButton), false), true);
});
