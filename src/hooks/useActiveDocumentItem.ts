'use client';

import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { setActiveDocumentItemAction } from '@/store/features/activeDocumentItemSlice';
import { DocumentItemTab } from '@/types/explorerTabs';

export const useActiveDocumentItem = () => {
    const dispatch = useAppDispatch();
    const activeDocumentItem = useAppSelector((state) => (state.activeDocumentItem as { activeDocumentItem: DocumentItemTab })?.activeDocumentItem ?? { id: '', name: '' });
    
    const setActiveDocumentItem = (documentItem: DocumentItemTab) => dispatch(setActiveDocumentItemAction(documentItem));

    return { activeDocumentItem, setActiveDocumentItem };
};