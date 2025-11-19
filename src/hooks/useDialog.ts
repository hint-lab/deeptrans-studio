'use client';

import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { toggle } from '@/store/features/dialogSlice';

export const useDialog = () => {
    const dispatch = useAppDispatch();
    const isDialogOpen = useAppSelector((state) => (state.dialog as { isOpen: boolean })?.isOpen ?? false);

    const toggleDialog = () => dispatch(toggle());

    return { isDialogOpen, toggleDialog };
};