'use client';

import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { setTabBarsAction, setActiveIDAction } from '@/store/features/tabbarSlice';

export const useEditorTabs = () => {
    const dispatch = useAppDispatch();
    const tabBars = useAppSelector((state) => (state.tabBar as { tabBars: any[] })?.tabBars ?? []);
    const activeID = useAppSelector((state) => (state.tabBar as { activeID: any })?.activeID ?? null);
    const setEditorTabBars = (tabBars: any[]) => dispatch(setTabBarsAction(tabBars));
    const setActiveEditorTabID = (activeID: any) => dispatch(setActiveIDAction(activeID));

    return { tabBars, activeID, setEditorTabBars, setActiveEditorTabID };
};