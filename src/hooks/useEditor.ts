import { useRef } from 'react';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import {
    selectSourceEditorId,
    selectTargetEditorId,
    selectSourceContent,
    selectTargetContent,
    setSourceEditorId,
    setTargetEditorId,
    setSourceContent,
    setTargetContent,
    selectEditorOpen,
    setEditorOpen as setEditorOpenAction,
} from '@/store/features/editorSlice';
import { Editor } from '@tiptap/react';

// 共享的编辑器实例（模块级，便于跨组件访问当前实例）
let sourceEditorInstance: Editor | null = null;
let targetEditorInstance: Editor | null = null;

export const useSourceEditor = () => {
    const dispatch = useAppDispatch();

    const setEditor = (editor: Editor | null) => {
        sourceEditorInstance = editor;
        dispatch(setSourceEditorId(editor ? 'source' : null));
    };

    return {
        get editor() {
            return sourceEditorInstance;
        },
        setEditor,
    } as { editor: Editor | null; setEditor: (e: Editor | null) => void };
};

export const useTargetEditor = () => {
    const dispatch = useAppDispatch();

    const setEditor = (editor: Editor | null) => {
        targetEditorInstance = editor;
        dispatch(setTargetEditorId(editor ? 'target' : null));
    };

    return {
        get editor() {
            return targetEditorInstance;
        },
        setEditor,
    } as { editor: Editor | null; setEditor: (e: Editor | null) => void };
};

// 可选导出：用于非 Hook 环境读取实例
export const getSourceEditorInstance = () => sourceEditorInstance;
export const getTargetEditorInstance = () => targetEditorInstance;

export const useEditorContent = (type: 'source' | 'target') => {
    const dispatch = useAppDispatch();
    const content = useAppSelector(type === 'source' ? selectSourceContent : selectTargetContent);

    const setContent = (newContent: string) => {
        dispatch(type === 'source' ? setSourceContent(newContent) : setTargetContent(newContent));
    };

    return { content, setContent };
};

export const useEditorOpen = () => {
    const dispatch = useAppDispatch();
    const editorOpen = useAppSelector(selectEditorOpen);
    const setEditorOpen = (open: boolean) => dispatch(setEditorOpenAction(open));
    return { editorOpen, setEditorOpen };
};
