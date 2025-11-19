import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { type ExplorerTabs, type DocumentItemTab } from '@/types/explorerTabs';


// 完整的项目结构  
interface ExplorerTabsState {
    explorerTabs: ExplorerTabs;
}

const initialState: ExplorerTabsState = {
    explorerTabs: {
        projectId: '',
        projectName: '',
        documentTabs: [],
    },
};

export const ExplorerTabsSlice = createSlice({
    name: 'ExplorerTabs',
    initialState,
    reducers: {
        // 兼容误传函数式更新器（将其在 reducer 内立即求值为普通对象，保证可序列化）
        setExplorerTabsAction: (state, action: PayloadAction<any>) => {
            const next = typeof action.payload === 'function'
                ? action.payload(state.explorerTabs)
                : action.payload;
            state.explorerTabs = next as ExplorerTabs;
        },
        // 更新特定文档项的状态
        updateDocumentItemStatusAction: (state, action: PayloadAction<{ itemId: string; status: string }>) => {
            const { itemId, status } = action.payload;
            state.explorerTabs.documentTabs.forEach(doc => {
                if (doc.items) {
                    const item = doc.items.find(item => item.id === itemId);
                    if (item) {
                        item.status = status;
                    }
                }
            });
        },
    },
});

export const { setExplorerTabsAction, updateDocumentItemStatusAction } = ExplorerTabsSlice.actions;
export default ExplorerTabsSlice.reducer;
