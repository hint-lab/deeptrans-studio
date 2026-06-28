'use client';
import { renameDocumentAction } from '@/actions/document';
import { fetchProjectTabsAction } from '@/actions/explorer-tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { getTranslationStageLabel } from '@/constants/translationStages';
import { useActiveDocumentItem } from '@/hooks/useActiveDocumentItem';
import { useExplorerTabs } from '@/hooks/useExplorerTabs';
import { createLogger } from '@/lib/logger';
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
    const isHuman =
        status === 'MT_REVIEW' ||
        status === 'QA_REVIEW' ||
        status === 'POST_EDIT' ||
        status === 'SIGN_OFF';
    const isCompleted = status === 'COMPLETED';

    let dotClass = 'w-2 h-2 rounded-full bg-gray-400';

    if (isCompleted) {
        dotClass = 'w-2 h-2 rounded-full bg-green-600';
    } else if (isHuman) {
        //dotClass = 'w-2 h-2 rounded-full bg-amber-500';
        dotClass = 'w-2 h-2 rounded-full bg-indigo-500';
    } else if (status !== 'NOT_STARTED') {
        dotClass = 'w-2 h-2 rounded-full bg-indigo-500';
    }

    return <span className={dotClass} />;
};
const ItemStatusBadge = ({ status }: { status: string }) => {
    const base =
        'px-2 py-[2px] rounded-full whitespace-nowrap border text-[10px] transition-all duration-200';
    const isHuman =
        status === 'MT_REVIEW' ||
        status === 'QA_REVIEW' ||
        status === 'POST_EDIT' ||
        status === 'SIGN_OFF';
    const isCompleted = status === 'COMPLETED';

    let cls = `${base} bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-foreground/70`;

    if (isCompleted) {
        cls = `${base} bg-green-600 border-green-700 text-white shadow`;
    } else if (isHuman) {
        //cls = `${base} bg-amber-500 border-amber-600 text-white shadow`;
        cls = `${base} bg-amber-500 border-indigo-600 text-white shadow`;
    } else if (status !== 'NOT_STARTED') {
        cls = `${base} bg-indigo-500 border-indigo-600 text-white shadow`;
    }

    const t = useTranslations('IDE.explorerPanel');
    const tStage = useTranslations('IDE.translationStages');
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
    const [isLoading, setIsLoading] = useState(true);
    const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
    const [renamingDocumentId, setRenamingDocumentId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [isSavingRename, setIsSavingRename] = useState(false);
    const listRef = useRef<HTMLUListElement | null>(null);
    const scrollTopRef = useRef<number>(0);

    const handleDocumentTabClick = (element: DocumentTab) => {
        if (element.items) {
            // 记录滚动位置，展开/收起后还原，避免列表“蹦跳”
            const prevScroll = listRef.current?.scrollTop ?? 0;
            setExpandedFolders(prev => ({ ...prev, [element.id]: !prev[element.id] }));
            setTimeout(() => {
                if (listRef.current) listRef.current.scrollTop = prevScroll;
            }, 0);
        }
    };

    const handleDocumentItemClick = (element: DocumentItemTab) => {
        if (element.id === activeDocumentItem.id) return;
        setActiveDocumentItem(element);
        logger.debug('element', element);
    };

    const handleOutlineItemClick = (element: ExplorerNode) => {
        const hasChildren = !!element.children?.length;
        if (hasChildren) {
            setExpandedFolders(prev => ({ ...prev, [element.id]: !prev[element.id] }));
        }
        handleDocumentItemClick(element);
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
            toast.error(error instanceof Error ? error.message : t('renameFailed'));
        } finally {
            setIsSavingRename(false);
        }
    };

    // 在数据变动后恢复滚动位置，避免因列表重新渲染导致的“乱跳”
    useLayoutEffect(() => {
        const el = listRef.current;
        if (el) el.scrollTop = scrollTopRef.current;
    }, [explorerTabs]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setIsLoading(true);
                // 获取数据...
                const projectTabs = await fetchProjectTabsAction(projectId);
                // 转换 ProjectTabs 到 ExplorerTabs
                logger.debug('projectTabs', projectTabs);
                setExplorerTabs({
                    ...projectTabs,
                });
            } catch (error) {
                logger.error(t('dataLoadFailed'), error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [projectId]);

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
                <div
                    className={`flex cursor-pointer select-none items-center gap-1 rounded-sm px-2 py-1.5 font-normal hover:bg-accent hover:text-accent-foreground ${isActive ? 'bg-accent text-accent-foreground' : ''}`}
                    onClick={() => handleOutlineItemClick(documentItem)}
                    data-file-id={documentItem.id}
                >
                    {hasChildren ? (
                        <span className="flex h-4 w-4 items-center justify-center text-muted-foreground">
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
                </div>
                {hasChildren && isExpanded && (
                    <ul className="pl-5">
                        {documentItem.children?.map(child =>
                            renderOutlineItem(child as ExplorerNode, 3)
                        )}
                    </ul>
                )}
            </li>
        );
    };

    return (
        <div className="flex size-full flex-col justify-start">
            <div className="flex items-center justify-between border-b bg-muted/40 px-2 py-2 text-[11px] text-foreground/70">
                <span className="font-medium">{t('files')}</span>
                <div className="flex items-center gap-1">
                    {/* 工具按钮区（导出已移至顶栏菜单） */}
                </div>
            </div>

            {isLoading ? (
                <div className="p-2">
                    <div className="space-y-2">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <Skeleton key={i} className="h-5 w-full" />
                        ))}
                    </div>
                </div>
            ) : explorerTabs &&
              explorerTabs.documentTabs &&
              explorerTabs.documentTabs.length > 0 ? (
                <ul
                    ref={listRef}
                    className="flex flex-col overflow-y-auto p-2 text-sm text-foreground [overflow-anchor:none]"
                    data-explorer
                    onScroll={e => {
                        scrollTopRef.current = (e.currentTarget as HTMLUListElement).scrollTop;
                    }}
                >
                    {explorerTabs.documentTabs.map(document => (
                        <React.Fragment key={document.id}>
                            <li
                                className={`group flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-accent hover:text-accent-foreground ${document.items && expandedFolders[document.id] ? 'bg-accent text-accent-foreground' : ''} font-medium`}
                                onClick={() => handleDocumentTabClick(document)}
                            >
                                <FileIcon className="h-4 w-4 flex-none shrink-0" />
                                {renamingDocumentId === document.id ? (
                                    <div
                                        className="flex min-w-0 flex-1 items-center gap-1"
                                        onClick={e => e.stopPropagation()}
                                    >
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
                                ) : (
                                    <>
                                        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left">
                                            {document.name}
                                        </span>
                                        <button
                                            type="button"
                                            className="flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground opacity-0 hover:bg-background/80 hover:text-foreground focus:opacity-100 group-hover:opacity-100"
                                            title={t('renameFile')}
                                            aria-label={t('renameFile')}
                                            onClick={e => {
                                                e.stopPropagation();
                                                startRenamingDocument(document);
                                            }}
                                        >
                                            <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                    </>
                                )}
                            </li>
                            {document.items && expandedFolders[document.id] && (
                                <ul className="pl-4">
                                    {buildThreeLevelOutline(document.items).map(documentItem =>
                                        renderOutlineItem(documentItem, 2)
                                    )}
                                </ul>
                            )}
                        </React.Fragment>
                    ))}
                </ul>
            ) : (
                <div>{t('noDocuments')}</div>
            )}
        </div>
    );
};

export default ExplorerView;
