'use client';

import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { setOpen, toggle } from '@/store/features/bottomPanelSlice';

export const useBottomPanel = () => {
    const dispatch = useAppDispatch();
    const isBottomPanelOpen = useAppSelector(
        state => (state.panel as { isOpen: boolean })?.isOpen ?? false
    );

    const toggleBottomPanel = () => dispatch(toggle());
    const setBottomPanelOpen = (isOpen: boolean) => dispatch(setOpen(isOpen));

    return { isBottomPanelOpen, toggleBottomPanel, setBottomPanelOpen };
};
