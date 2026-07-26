export function normalizeKeyboardKey(key: unknown): string {
    return typeof key === 'string' ? key.toLowerCase() : '';
}

const EDITABLE_TARGET_SELECTOR =
    'input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="textbox"]';
const IDE_SHORTCUT_EXCLUDED_SURFACE_SELECTOR = '[role="dialog"], [role="menu"], [role="listbox"]';

const IDE_SHORTCUT_EXCLUDED_ROLES = new Set(['dialog', 'menu', 'listbox']);

type EditableTargetLike = {
    tagName?: unknown;
    isContentEditable?: unknown;
    getAttribute?: (name: string) => string | null;
    closest?: (selector: string) => unknown;
    parentElement?: unknown;
};

function isEditableElement(target: EditableTargetLike): boolean {
    const tagName = typeof target.tagName === 'string' ? target.tagName.toLowerCase() : '';
    if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') return true;
    if (target.isContentEditable === true) return true;

    const contentEditable = target.getAttribute?.('contenteditable');
    return contentEditable === '' || contentEditable?.toLowerCase() === 'true';
}

function hasIDEGlobalShortcutExcludedRole(target: EditableTargetLike): boolean {
    const role = target.getAttribute?.('role')?.toLowerCase();
    return Boolean(role && IDE_SHORTCUT_EXCLUDED_ROLES.has(role));
}

/**
 * Global IDE shortcuts must not replace native editing commands while focus is
 * in a text field or a rich-text editor. The implementation intentionally uses
 * DOM-shaped duck typing so it stays safe in SSR and node:test environments.
 */
export function isEditableKeyboardTarget(target: EventTarget | null | undefined): boolean {
    if (!target || typeof target !== 'object') return false;

    const element = target as EditableTargetLike;
    if (isEditableElement(element)) return true;

    if (typeof element.closest === 'function') {
        return Boolean(element.closest(EDITABLE_TARGET_SELECTOR));
    }

    const parent = element.parentElement;
    return parent && parent !== target ? isEditableKeyboardTarget(parent as EventTarget) : false;
}

/**
 * Batch IDE shortcuts are workspace commands. Do not let them escape a
 * modal, menu, or listbox merely because focus happens to be on a Button
 * rather than a text field inside that interactive surface.
 */
export function isIDEGlobalShortcutExcludedTarget(target: EventTarget | null | undefined): boolean {
    if (!target || typeof target !== 'object') return false;

    const element = target as EditableTargetLike;
    if (hasIDEGlobalShortcutExcludedRole(element)) return true;

    if (typeof element.closest === 'function') {
        return Boolean(element.closest(IDE_SHORTCUT_EXCLUDED_SURFACE_SELECTOR));
    }

    const parent = element.parentElement;
    return parent && parent !== target
        ? isIDEGlobalShortcutExcludedTarget(parent as EventTarget)
        : false;
}

/**
 * Keep batch/workflow shortcuts available in the workspace, but never steal a
 * native editor shortcut such as Cmd/Ctrl+B from focused editable content.
 */
export function shouldHandleIDEGlobalShortcut(
    event: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'target'>,
    isRunning: boolean
): boolean {
    return (
        !isRunning &&
        (event.metaKey || event.ctrlKey) &&
        !isEditableKeyboardTarget(event.target) &&
        !isIDEGlobalShortcutExcludedTarget(event.target)
    );
}
