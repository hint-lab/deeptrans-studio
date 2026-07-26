'use client';
import { renameDocumentAction } from '@/actions/document';
import { fetchProjectTabsAction } from '@/actions/explorer-tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
    getTranslationStageBadgeClass,
    getTranslationStageDotClass,
    getTranslationStageLabel,
} from '@/constants/translationStages';
import { useActiveDocumentItem } from '@/hooks/useActiveDocumentItem';
import { getTargetEditorInstance } from '@/hooks/useEditor';
import { useExplorerTabs } from '@/hooks/useExplorerTabs';
import { useTranslationState } from '@/hooks/useTranslation';
import { getExplorerDisclosureAction } from '@/lib/explorer-tree-keyboard';
import {
    completeExplorerLoad,
    failExplorerLoad,
    initialExplorerLoadState,
    isCurrentExplorerLoadRequest,
    startExplorerLoad,
} from '@/lib/explorer-load-state';
import { createLogger } from '@/lib/logger';
import {
    canLeaveCurrentPostEditDraft,
    POST_EDIT_DRAFT_DISCARD_MESSAGE,
} from '@/lib/post-edit-draft-navigation';
import type { TranslationStage } from '@/store/features/translationSlice';
import { DocumentItemTab, DocumentTab } from '@/types/explorerTabs';
import { Check, ChevronDown, ChevronRight, FileIcon, Pencil, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
const logger = createLogger(
    {
        type: 'ide:explorer',
    },
    {
        json: false, // 开启json格式输出
        pretty: false, // 关闭开发环境美化输出
        colors: true, // 仅当json：false时启用颜色输出可用
        includeCaller: false, // 日志不包含调用者
    }
);
// 本地子组件：状态点与状态徽章
const ItemStatusDot = ({ status }: { status: string }) => {
    return (
        <span
            className={`inline-block h-2 w-2 flex-none shrink-0 rounded-full ${getTranslationStageDotClass(status)}`}
        />
    );
};
const ItemStatusBadge = ({ status }: { status: string }) => {
    const t = useTranslations('IDE.explorerPanel');
    const tStage = useTranslations('IDE.translationStages');
    const cls = getTranslationStageBadgeClass(status);
    const label = getTranslationStageLabel(status as TranslationStage, tStage) || t('prepare');
    return <span className={cls}>{label}</span>;
};

type ExplorerNode = DocumentItemTab & {
    children?: DocumentItemTab[];
};

function itemType(item: DocumentItemTab) {
    return String(item.type || '').toUpperCase();
}

function isTitleItem(item: DocumentItemTab) {
    return itemType(item) === 'TITLE';
}

function isHeadingItem(item: DocumentItemTab) {
    const level = Number((item.metadata as any)?.level || 0);
    const type = itemType(item);
    return type.startsWith('HEADING') || (level >= 1 && level <= 6);
}

function buildThreeLevelOutline(items: DocumentItemTab[]) {
    const nodes: ExplorerNode[] = [];
    let currentHeading: ExplorerNode | null = null;

    for (const item of items) {
        if (isTitleItem(item)) continue;

        if (isHeadingItem(item)) {
            currentHeading = { ...item, children: [] };
            nodes.push(currentHeading);
            continue;
        }

        if (currentHeading) {
            currentHeading.children = [...(currentHeading.children ?? []), item];
        } else {
            nodes.push(item);
        }
    }

    return nodes;
}

// 本地主组件：
const ExplorerView = ({ projectId }: { projectId: string }) => {
    const t = useTranslations('IDE.explorerPanel');
    const { explorerTabs, setExplorerTabs } = useExplorerTabs();
    const { activeDocumentItem, setActiveDocumentItem } = useActiveDocumentItem();
    const { currentStage } = useTranslationState();
    const initialExplorerLoadRef = useRef(
        explorerTabs.projectId === projectId
            ? completeExplorerLoad(explorerTabs.documentTabs.length)
            : initialExplorerLoadState
    );
    const [explorerLoad, setExplorerLoad] = useState(initialExplorerLoadRef.current);
    const [reloadRequest, setReloadRequest] = useState(0);
    const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
    const [renamingDocumentId, setRenamingDocumentId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [isSavingRename, setIsSavingRename] = useState(false);
    const listRef = useRef<HTMLUListElement | null>(null);
    const scrollTopRef = useRef<number>(0);
    const explorerLoadRef = useRef(initialExplorerLoadRef.current);
    const explorerTabsRef = useRef(explorerTabs);
    const loadRequestIdRef = useRef(0);
    const displayedProjectIdRef = useRef(projectId);

    // Guard old responses during the interval before an effect cleanup runs.
    displayedProjectIdRef.current = projectId;

    const updateExplorerLoad = (next: typeof explorerLoad) => {
        explorerLoadRef.current = next;
        setExplorerLoad(next);
    };

    const setFolderExpanded = (folderId: string, isExpanded: boolean) => {
        // 记录滚动位置，展开/收起后还原，避免列表“蹦跳”
        const prevScroll = listRef.current?.scrollTop ?? 0;
        setExpandedFolders(prev => {
            if (Boolean(prev[folderId]) === isExpanded) return prev;
            return { ...prev, [folderId]: isExpanded };
        });
        setTimeout(() => {
            if (listRef.current) listRef.current.scrollTop = prevScroll;
        }, 0);
    };

    const toggleFolder = (folderId: string) => {
        // 记录滚动位置，展开/收起后还原，避免列表“蹦跳”
        const prevScroll = listRef.current?.scrollTop ?? 0;
        setExpandedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
        setTimeout(() => {
            if (listRef.current) listRef.current.scrollTop = prevScroll;
        }, 0);
    };

    const handleDocumentTabClick = (element: DocumentTab) => {
        if (element.items.length > 0) {
            toggleFolder(element.id);
        }
    };

    const handleDocumentItemClick = (element: DocumentItemTab) => {
        if (element.id === activeDocumentItem.id) return;
        const targetEditor = getTargetEditorInstance();
        const targetElement = targetEditor?.view.dom;
        const canLeave = canLeaveCurrentPostEditDraft(
            {
                activeItemId: activeDocumentItem.id,
                currentStage,
                editorItemId: targetElement?.getAttribute('data-deeptrans-editor-item-id'),
                editorJob: targetElement?.getAttribute('data-deeptrans-editor-job'),
                editorDirty: targetElement?.getAttribute('data-deeptrans-editor-dirty'),
            },
            () => window.confirm(POST_EDIT_DRAFT_DISCARD_MESSAGE)
        );
        if (!canLeave) return;
        setActiveDocumentItem(element);
        logger.debug('element', element);
    };

    const handleOutlineItemClick = (element: ExplorerNode) => {
        const hasChildren = !!element.children?.length;
        if (hasChildren) {
            toggleFolder(element.id);
        }
        handleDocumentItemClick(element);
    };

    const handleDisclosureKeyDown = (
        event: React.KeyboardEvent<HTMLButtonElement>,
        folderId: string,
        hasChildren: boolean,
        isExpanded: boolean
    ) => {
        const action = getExplorerDisclosureAction(event.key, { hasChildren, isExpanded });
        if (!action) return;

        event.preventDefault();
        setFolderExpanded(folderId, action === 'expand');
    };

    const startRenamingDocument = (document: DocumentTab) => {
        setRenamingDocumentId(document.id);
        setRenameValue(document.name);
    };

    const cancelRenamingDocument = () => {
        setRenamingDocumentId(null);
        setRenameValue('');
    };

    const commitRenamingDocument = async (document: DocumentTab) => {
        const nextName = renameValue.trim();
        if (!nextName) {
            toast.error(t('fileNameRequired'));
            return;
        }
        if (nextName === document.name) {
            cancelRenamingDocument();
            return;
        }

        try {
            setIsSavingRename(true);
            const result = await renameDocumentAction(document.id, nextName);
            setExplorerTabs(prev => ({
                ...prev,
                documentTabs: prev.documentTabs.map(tab =>
                    tab.id === document.id ? { ...tab, name: result.name } : tab
                ),
            }));
            toast.success(t('renameSaved'));
            cancelRenamingDocument();
        } catch (error) {
            logger.error(t('renameFailed'), error);
            toast.error(t('renameFailed'));
        } finally {
            setIsSavingRename(false);
        }
    };

    // 在数据变动后恢复滚动位置，避免因列表重新渲染导致的“乱跳”
    useLayoutEffect(() => {
        const el = listRef.current;
        if (el) el.scrollTop = scrollTopRef.current;
    }, [explorerTabs]);

    useLayoutEffect(() => {
        explorerTabsRef.current = explorerTabs;
    }, [explorerTabs]);

    useEffect(() => {
        const requestId = ++loadRequestIdRef.current;
        const hasCurrentProjectResult =
            explorerTabsRef.current.projectId === projectId &&
            explorerLoadRef.current.hasLoadedResult;
        const pendingState = hasCurrentProjectResult
            ? startExplorerLoad(explorerLoadRef.current)
            : initialExplorerLoadState;
        updateExplorerLoad(pendingState);
        let disposed = false;

        const fetchData = async () => {
            try {
                const projectTabs = await fetchProjectTabsAction(projectId);
                const requestIsCurrent =
                    !disposed &&
                    requestId === loadRequestIdRef.current &&
                    displayedProjectIdRef.current === projectId;
                if (!requestIsCurrent) return;
                if (
                    !isCurrentExplorerLoadRequest(
                        requestId,
                        loadRequestIdRef.current,
                        projectId,
                        projectTabs.projectId
                    )
                ) {
                    throw new Error('Explorer response did not match the requested project');
                }

                logger.debug('projectTabs', projectTabs);
                setExplorerTabs(projectTabs);
                updateExplorerLoad(completeExplorerLoad(projectTabs.documentTabs.length));
            } catch (error) {
                if (
                    disposed ||
                    requestId !== loadRequestIdRef.current ||
                    displayedProjectIdRef.current !== projectId
                ) {
                    return;
                }
                logger.error(t('dataLoadFailed'), error);
                updateExplorerLoad(failExplorerLoad(explorerLoadRef.current));
            }
        };

        void fetchData();
        return () => {
            disposed = true;
        };
    }, [projectId, reloadRequest]);

    const retryExplorerLoad = () => {
        setReloadRequest(previous => previous + 1);
    };

    const handleCreateFile = () => {
        const newElement = {
            id: 'newElement',
            name: t('newFile'),
        };
    };

    const renderOutlineItem = (documentItem: ExplorerNode, depth: 2 | 3) => {
        const hasChildren = !!documentItem.children?.length;
        const isExpanded = !!expandedFolders[documentItem.id];
        const isActive = documentItem.id === activeDocumentItem.id;
        const isHeading = isHeadingItem(documentItem);

        return (
            <li key={documentItem.id}>
                <button
                    type="button"
                    className={`flex w-full select-none items-center gap-1 rounded-sm px-2 py-1.5 text-left font-normal hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${isActive ? 'bg-accent text-accent-foreground' : ''}`}
                    onClick={() => handleOutlineItemClick(documentItem)}
                    onKeyDown={event =>
                        handleDisclosureKeyDown(event, documentItem.id, hasChildren, isExpanded)
                    }
                    aria-expanded={hasChildren ? isExpanded : undefined}
                    aria-current={isActive ? 'true' : undefined}
                    data-file-id={documentItem.id}
                >
                    {hasChildren ? (
                        <span
                            aria-hidden="true"
                            className="flex h-4 w-4 items-center justify-center text-muted-foreground"
                        >
                            {isExpanded ? (
                                <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                                <ChevronRight className="h-3.5 w-3.5" />
                            )}
                        </span>
                    ) : (
                        <span className="h-4 w-4 flex-none" />
                    )}
                    <ItemStatusDot status={documentItem.status as any} />
                    <span
                        className={`overflow-hidden text-ellipsis whitespace-nowrap text-left ${depth === 3 ? 'text-foreground/80' : 'text-foreground'} ${isHeading ? 'font-medium' : ''}`}
                    >
                        {documentItem.name}
                    </span>
                    <span className="ml-auto">
                        <ItemStatusBadge status={documentItem.status as any} />
                    </span>
                </button>
                {hasChildren && isExpanded && (
                    <ul className="pl-5" aria-label={documentItem.name}>
                        {documentItem.children?.map(child =>
                            renderOutlineItem(child as ExplorerNode, 3)
                        )}
                    </ul>
                )}
            </li>
        );
    };

    const hasCurrentProjectResult =
        explorerLoad.hasLoadedResult && explorerTabs.projectId === projectId;
    const currentDocumentTabs = hasCurrentProjectResult ? explorerTabs.documentTabs : [];

    return (
        <div className="flex size-full flex-col justify-start">
            <div className="flex items-center justify-between border-b bg-muted/40 px-2 py-2 text-[11px] text-foreground/70">
                <span className="font-medium">{t('files')}</span>
                <div className="flex items-center gap-1">
                    {explorerLoad.isRefreshing && (
                        <span role="status" aria-live="polite" className="text-muted-foreground">
                            {t('refreshingFiles')}
                        </span>
                    )}
                </div>
            </div>

            {explorerLoad.hasError && (
                <div
                    role="alert"
                    className="mx-2 mt-2 flex items-center justify-between gap-2 rounded-sm border border-destructive/30 bg-destructive/5 px-2 py-2 text-xs text-destructive"
                >
                    <span>{t('dataLoadFailed')}</span>
                    <button
                        type="button"
                        className="shrink-0 rounded-sm border border-destructive/30 bg-background px-2 py-1 font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                        onClick={retryExplorerLoad}
                    >
                        {t('retryLoad')}
                    </button>
                </div>
            )}

            {explorerLoad.phase === 'loading' ||
            (!hasCurrentProjectResult && !explorerLoad.hasError) ? (
                <div className="p-2" aria-busy="true" aria-label={t('loadingFiles')}>
                    <div className="space-y-2">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <Skeleton key={i} className="h-5 w-full" />
                        ))}
                    </div>
                </div>
            ) : hasCurrentProjectResult && currentDocumentTabs.length > 0 ? (
                <ul
                    ref={listRef}
                    className="flex flex-col overflow-y-auto p-2 text-sm text-foreground [overflow-anchor:none]"
                    data-explorer
                    onScroll={e => {
                        scrollTopRef.current = (e.currentTarget as HTMLUListElement).scrollTop;
                    }}
                >
                    {currentDocumentTabs.map(document => (
                        <li key={document.id} className="group">
                            <div
                                className={`flex items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-accent hover:text-accent-foreground ${document.items.length > 0 && expandedFolders[document.id] ? 'bg-accent text-accent-foreground' : ''} font-medium`}
                            >
                                {renamingDocumentId === document.id ? (
                                    <>
                                        <FileIcon
                                            aria-hidden="true"
                                            className="h-4 w-4 flex-none shrink-0"
                                        />
                                        <div className="flex min-w-0 flex-1 items-center gap-1">
                                            <input
                                                value={renameValue}
                                                autoFocus
                                                disabled={isSavingRename}
                                                onChange={e => setRenameValue(e.target.value)}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        commitRenamingDocument(document);
                                                    }
                                                    if (e.key === 'Escape') {
                                                        e.preventDefault();
                                                        cancelRenamingDocument();
                                                    }
                                                }}
                                                className="h-6 min-w-0 flex-1 rounded-sm border border-input bg-background px-2 text-xs outline-none ring-offset-background focus-visible:ring-1 focus-visible:ring-ring"
                                            />
                                            <button
                                                type="button"
                                                className="flex h-6 w-6 items-center justify-center rounded-sm hover:bg-background/80"
                                                title={t('saveRename')}
                                                aria-label={t('saveRename')}
                                                disabled={isSavingRename}
                                                onClick={() => commitRenamingDocument(document)}
                                            >
                                                <Check className="h-3.5 w-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                className="flex h-6 w-6 items-center justify-center rounded-sm hover:bg-background/80"
                                                title={t('cancelRename')}
                                                aria-label={t('cancelRename')}
                                                disabled={isSavingRename}
                                                onClick={cancelRenamingDocument}
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <button
                                            type="button"
                                            className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                                            onClick={() => handleDocumentTabClick(document)}
                                            onKeyDown={event =>
                                                handleDisclosureKeyDown(
                                                    event,
                                                    document.id,
                                                    document.items.length > 0,
                                                    !!expandedFolders[document.id]
                                                )
                                            }
                                            aria-expanded={
                                                document.items.length > 0
                                                    ? !!expandedFolders[document.id]
                                                    : undefined
                                            }
                                        >
                                            <FileIcon
                                                aria-hidden="true"
                                                className="h-4 w-4 flex-none shrink-0"
                                            />
                                            <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left">
                                                {document.name}
                                            </span>
                                        </button>
                                        <button
                                            type="button"
                                            className="flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground opacity-0 hover:bg-background/80 hover:text-foreground focus:opacity-100 group-hover:opacity-100"
                                            title={t('renameFile')}
                                            aria-label={t('renameFile')}
                                            onClick={() => startRenamingDocument(document)}
                                        >
                                            <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                    </>
                                )}
                            </div>
                            {document.items.length > 0 && expandedFolders[document.id] && (
                                <ul className="pl-4" aria-label={document.name}>
                                    {buildThreeLevelOutline(document.items).map(documentItem =>
                                        renderOutlineItem(documentItem, 2)
                                    )}
                                </ul>
                            )}
                        </li>
                    ))}
                </ul>
            ) : explorerLoad.phase === 'empty' && hasCurrentProjectResult ? (
                <div className="p-3 text-sm text-muted-foreground">{t('noDocuments')}</div>
            ) : null}
        </div>
    );
};

export default ExplorerView;
