'use client';

import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { toggle } from '@/store/features/sidebarSlice';


export const useSidebar = () => {
    const dispatch = useAppDispatch();
    const isSidebarOpen = useAppSelector((state) => state.sidebar?.isOpen ?? false);

    const toggleSidebar = () => dispatch(toggle());

    return { isSidebarOpen, toggleSidebar };
};