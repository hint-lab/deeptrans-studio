export type IDELayoutMode = 'none' | 'chat' | 'preview' | 'help';

export type IDELayoutSizes =
    | readonly [sidebar: number, editor: number]
    | readonly [sidebar: number, editor: number, rightPanel: number];

export function getIDEExplorerPanelSize(isSidebarOpen: boolean) {
    return isSidebarOpen ? 15 : 0;
}

export function getIDELayoutSizes(isSidebarOpen: boolean, mode: IDELayoutMode): IDELayoutSizes {
    const sidebar = getIDEExplorerPanelSize(isSidebarOpen);

    if (mode === 'none') {
        return [sidebar, 100 - sidebar];
    }

    return isSidebarOpen ? [sidebar, 60, 25] : [sidebar, 75, 25];
}
