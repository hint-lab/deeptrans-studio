import { configureStore } from '@reduxjs/toolkit';
import editorReducer from './features/editorSlice';
import translationReducer from './features/translationSlice';
import sidebarReducer from './features/sidebarSlice';
import chatbarReducer from './features/chatbarSlice';
import tabBarReducer from './features/tabbarSlice';
import explorerTabsReducer from './features/explorerTabsSlice';
import activeDocumentItemReducer from './features/activeDocumentItemSlice';
import activeDocumentReducer from './features/activeDocumentSlice';
import dialogReducer from './features/dialogSlice';
import logReducer from './features/logSlice';
import panelReducer from './features/bottomPanelSlice';
import runningReducer from './features/runningSlice';
import rightPaneReducer from './features/rightPaneSlice';
import projectInitReducer from './features/projectInitSlice';
import workFlowStepReducer from './features/workFlowStepSlice';
export const store = configureStore({
    reducer: {
        editor: editorReducer,
        translation: translationReducer,
        sidebar: sidebarReducer,
        chatbar: chatbarReducer,
        explorerTabs: explorerTabsReducer,
        tabBar: tabBarReducer,
        activeDocument: activeDocumentReducer,
        activeDocumentItem: activeDocumentItemReducer,
        dialog: dialogReducer,
        log: logReducer,
        panel: panelReducer,
        running: runningReducer,
        rightPane: rightPaneReducer,
        projectInit: projectInitReducer,
        workFlowStep: workFlowStepReducer,
    },
});

// Infer the type of store
export type AppStore = typeof store;
// 获取 `dispatch` 类型
export type AppDispatch = typeof store.dispatch;
// 获取 `RootState` 类型
export type RootState = ReturnType<typeof store.getState>;
