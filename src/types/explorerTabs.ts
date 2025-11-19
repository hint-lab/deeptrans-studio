export interface ExplorerTabs {
    projectId: string;
    projectName: string;
    documentTabs: DocumentTab[];
}

export interface DocumentItemTab {
    id: string;
    name: string;
    status?: string;
}

export interface DocumentTab {
    id: string;
    name: string;
    items: DocumentItemTab[];
    collapsed: boolean;
}
