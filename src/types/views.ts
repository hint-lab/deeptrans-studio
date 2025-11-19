// models.ts 已移除，以下 view 类型仅在本文件内定义最小所需结构
export interface ProjectDTO { id: string; name: string; date: string; sourceLanguage: string; targetLanguage: string }
export interface DocumentDTO { id: string; originalName: string; url: string; mimeType: string; status?: string }
export interface DocumentItemDTO { id: string; documentId: string; order: number; sourceText: string; targetText?: string | null; status?: string; type: string; metadata?: unknown }

export interface DocumentPreview {
  documentId: string;
  url: string;
  mimeType: string;
  name: string;
}

export interface ExplorerTabsViewProject extends ProjectDTO {
  // UI composition example
  documentTabs: Array<{
    id: string;
    name: string;
    collapsed: boolean;
    items: Array<{ id: string; name: string; status?: string }>;
  }>;
}

export interface DocumentWithItemsView extends DocumentDTO {
  documentItems: DocumentItemDTO[];
}


