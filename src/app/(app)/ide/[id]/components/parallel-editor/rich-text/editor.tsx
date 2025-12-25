'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import EditorToolbar from './toolbar/editor-toolbar';
import { useEffect, useState } from 'react';
import LineNumber from './extensions/line-number'; // 需要创建此扩展
import { useSourceEditor, useTargetEditor, useEditorContent } from '@/hooks/useEditor';
import { useTranslationContent } from '@/hooks/useTranslation';
import {
    updateTranslationAction,
    getContentByIdAction,
    updateOriginalTextAction,
} from '@/actions/document-item';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
// 修改编辑器组件接口
interface EditorProps {
    editorId: string;
    initialContent: string;
    placeholder?: string;
    job: 'rawtext' | 'translation';
    readOnly?: boolean;
    onUpdate?: (editor: any) => void;
}

// 单个富文本编辑器组件
const RichTextEditor = ({
    editorId, // 编辑器ID，通常是documentItem的id
    initialContent, // 初始内容
    placeholder, // 提示
    job, // 编辑器类型
    readOnly = false, // 是否只读
}: EditorProps) => {
    const t = useTranslations('IDE.editor');
    const { editor: sourceEditor, setEditor: setSourceEditor } = useSourceEditor();
    const { editor: targetEditor, setEditor: setTargetEditor } = useTargetEditor();
    const { content, setContent } = useEditorContent(job === 'rawtext' ? 'source' : 'target');
    const { setSourceTranslationText, setTargetTranslationText } = useTranslationContent();
    const [isEditMode, setIsEditMode] = useState<boolean>(false);
    const effectiveEditable = isEditMode && !readOnly;
    const editor = useEditor({
        extensions: [
            StarterKit as any,
            // LineNumber.configure({
            //     showLineNumbers: true,
            // }),
        ],
        editorProps: {
            attributes: {
                class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none line-numbers overflow-auto size-full',
            },
        },
        content: initialContent || content || '',
        editable: effectiveEditable,
        onUpdate: ({ editor }) => {
            const newContent = editor.getHTML();
            setContent(newContent);
        },
        immediatelyRender: false,
    });

    // 切换编辑模式时同步 TipTap 的 editable 状态
    useEffect(() => {
        if (editor) {
            editor.setEditable(effectiveEditable);
            if (effectiveEditable) {
                try {
                    editor.chain().focus().run();
                } catch {}
            }
        }
    }, [editor, effectiveEditable]);

    // 修复初始内容设置（不在此回写到服务端，仅本地、编辑器同步）
    useEffect(() => {
        if (editor && initialContent) {
            editor.commands.setContent(initialContent);
            setContent(initialContent);
        }
    }, [editor, initialContent, job, effectiveEditable, editorId]);

    // 设置编辑器实例
    useEffect(() => {
        if (editor) {
            if (job === 'rawtext') {
                setSourceEditor(editor);
            } else if (job === 'translation') {
                setTargetEditor(editor);
            }
        }
        return () => {
            if (job === 'rawtext') {
                setSourceEditor(null);
            } else if (job === 'translation') {
                setTargetEditor(null);
            }
        };
    }, [editor, job]);

    const handleSave = async () => {
        try {
            if (job === 'rawtext') {
                await updateOriginalTextAction(editorId, content);
                toast.success(t('saveRawSuccess'));
                try {
                    const fresh = await getContentByIdAction(editorId);
                    const next = fresh?.sourceText ?? content;
                    setSourceTranslationText(next);
                    try {
                        editor?.commands.setContent(next);
                    } catch {}
                } catch {
                    // 回退到本地内容
                    try {
                        setSourceTranslationText(content);
                    } catch {}
                }
            } else if (job === 'translation') {
                await updateTranslationAction(editorId, content);
                toast.success(t('saveTransSuccess'));
                try {
                    const fresh = await getContentByIdAction(editorId);
                    const next = fresh?.targetText ?? content;
                    setTargetTranslationText(next);
                    try {
                        editor?.commands.setContent(next);
                    } catch {}
                } catch {
                    // 回退到本地内容
                    try {
                        setTargetTranslationText(content);
                    } catch {}
                }
            }
            setIsEditMode(false);
        } catch (e) {
            toast.error(t('saveFailed', { error: String(e) }));
        }
    };

    if (!editor) return null;

    return (
        <div className="relative size-full rounded-b-md">
            {isEditMode && <EditorToolbar editor={editor} onSave={handleSave} />}
            {!isEditMode && !readOnly && (
                <div className="absolute right-1 top-1 z-20">
                    <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 border border-border/60 bg-background/80 px-2 text-foreground shadow-sm backdrop-blur-sm"
                        onClick={() => setIsEditMode(true)}
                    >
                        <Pencil className="mr-1 h-4 w-4" /> {t('edit')}
                    </Button>
                </div>
            )}
            <div className="editor-container relative h-full p-2">
                <EditorContent className="prose overflow-auto bg-card" editor={editor} />
            </div>
        </div>
    );
};

export default RichTextEditor;
