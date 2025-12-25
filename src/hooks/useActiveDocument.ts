'use client';

import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { setActiveDocumentAction } from '@/store/features/activeDocumentSlice';
import { DocumentTab } from '@/types/explorerTabs';

export const useActiveDocument = () => {
    const dispatch = useAppDispatch();
    const activeDocument = useAppSelector(
        state =>
            (state.activeDocument as { activeDocument: DocumentTab })?.activeDocument ?? {
                id: '',
                name: '',
            }
    );

    const setActiveDocument = (document: DocumentTab) =>
        dispatch(setActiveDocumentAction(document));

    return { activeDocument, setActiveDocument };
};
