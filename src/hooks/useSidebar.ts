'use client';

import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { setOpen, toggle } from '@/store/features/sidebarSlice';
import { useCallback } from 'react';

export const useSidebar = () => {
    const dispatch = useAppDispatch();
    const isSidebarOpen = useAppSelector(state => state.sidebar?.isOpen ?? false);

    const toggleSidebar = useCallback(() => dispatch(toggle()), [dispatch]);
    const closeSidebar = useCallback(() => dispatch(setOpen(false)), [dispatch]);

    return { isSidebarOpen, toggleSidebar, closeSidebar };
};
