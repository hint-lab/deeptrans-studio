'use client';

import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { setExplorerTabsAction, updateDocumentItemStatusAction } from '@/store/features/explorerTabsSlice';
import { ExplorerTabs, DocumentItemTab } from '@/types/explorerTabs';

export const useExplorerTabs = () => {
    const dispatch = useAppDispatch();
    const explorerTabs = useAppSelector((state) => (state.explorerTabs as { explorerTabs: ExplorerTabs }).explorerTabs);

    const setExplorerTabs = (next: ExplorerTabs | ((prev: ExplorerTabs) => ExplorerTabs)) => {
        const resolved = typeof next === 'function' ? (next as (p: ExplorerTabs) => ExplorerTabs)(explorerTabs) : next;
        dispatch(setExplorerTabsAction(resolved));
    };

    const updateDocumentItemStatus = (itemId: string, status: string) => {
        dispatch(updateDocumentItemStatusAction({ itemId, status }));
    };

    return { explorerTabs, setExplorerTabs, updateDocumentItemStatus };
};