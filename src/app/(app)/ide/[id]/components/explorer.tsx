'use client';
import React, { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { FilePlus2, Undo2, FileIcon, FolderIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useExplorerTabs } from '@/hooks/useExplorerTabs';
import { fetchProjectTabsAction } from '@/actions/explorer-tabs';
import { DocumentTab, DocumentItemTab } from '@/types/explorerTabs';
import { useActiveDocumentItem } from '@/hooks/useActiveDocumentItem';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { getTranslationStageLabel } from '@/constants/translationStages';
import type { TranslationStage } from '@/store/features/translationSlice';
import { useTranslations } from 'next-intl';
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

// 本地主组件：
const ExplorerView = ({ projectId }: { projectId: string }) => {
    const t = useTranslations('IDE.explorerPanel');
    const { explorerTabs, setExplorerTabs } = useExplorerTabs();
    const { activeDocumentItem, setActiveDocumentItem } = useActiveDocumentItem();
    const [isLoading, setIsLoading] = useState(true);
    const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
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
        console.log('element', element);
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
                console.log('projectTabs', projectTabs);
                setExplorerTabs({
                    ...projectTabs,
                });
            } catch (error) {
                console.error(t('dataLoadFailed'), error);
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
                                className={`flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-accent hover:text-accent-foreground ${document.items && expandedFolders[document.id] ? 'bg-accent text-accent-foreground' : ''} font-medium`}
                                onClick={() => handleDocumentTabClick(document)}
                            >
                                <FileIcon className="h-4 w-4 flex-none shrink-0" />
                                <span className="overflow-hidden text-ellipsis whitespace-nowrap text-left">
                                    {document.name}
                                </span>
                            </li>
                            {document.items && expandedFolders[document.id] && (
                                <ul className="pl-4">
                                    {document.items.map(documentItem => (
                                        <li
                                            key={documentItem.id}
                                            className={`flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 font-normal hover:bg-accent hover:text-accent-foreground ${documentItem.id === activeDocumentItem.id ? 'bg-accent text-accent-foreground' : ''} `}
                                            onClick={() => handleDocumentItemClick(documentItem)}
                                            data-file-id={documentItem.id}
                                        >
                                            {/* 'NOT_STARTED' | 'MT' | 'QA' | 'POST_EDIT' | 'SIGN_OFF' | 'ERROR'; */}
                                            <ItemStatusDot status={documentItem.status as any} />
                                            <span className="overflow-hidden text-ellipsis whitespace-nowrap text-left text-foreground">
                                                {documentItem.name}
                                            </span>
                                            <span className="ml-auto">
                                                <ItemStatusBadge
                                                    status={documentItem.status as any}
                                                />
                                            </span>
                                        </li>
                                    ))}
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
