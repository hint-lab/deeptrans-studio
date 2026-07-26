export type ExplorerDisclosureAction = 'expand' | 'collapse' | null;

/**
 * Returns the disclosure action that a native explorer row should take for an
 * ArrowLeft/ArrowRight key press. Enter and Space deliberately remain native
 * button behavior so both pointer and keyboard activation follow one path.
 */
export function getExplorerDisclosureAction(
    key: string,
    options: { hasChildren: boolean; isExpanded: boolean }
): ExplorerDisclosureAction {
    if (!options.hasChildren) return null;
    if (key === 'ArrowRight' && !options.isExpanded) return 'expand';
    if (key === 'ArrowLeft' && options.isExpanded) return 'collapse';
    return null;
}
