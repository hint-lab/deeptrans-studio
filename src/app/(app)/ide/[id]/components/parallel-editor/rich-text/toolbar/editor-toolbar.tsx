import React from 'react';
import { Editor } from '@tiptap/react';
import {
    Bold,
    Code,
    Italic,
    List,
    ListOrdered,
    Minus,
    Quote,
    Redo,
    Strikethrough,
    Undo,
    Save,
} from 'lucide-react';

import { Toggle } from 'src/components/ui/toggle';
import { ToggleGroup, Toolbar } from './toolbar';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';

// import { FormatType } from "./format-type"

interface EditorToolbarProps {
    editor: Editor;
    onSave?: () => void;
}

const EditorToolbar = ({ editor, onSave }: EditorToolbarProps) => {
    const t = useTranslations('IDE.editor');
    const handleSave = () => {
        console.log('save document');
        onSave?.();
    };

    return (
        <Toolbar className="m-0 flex items-center justify-between" aria-label="Formatting options">
            <ToggleGroup className="flex flex-row items-center" type="multiple">
                <Toggle
                    size="sm"
                    className="mr-1"
                    onPressedChange={() => editor.chain().focus().toggleBold().run()}
                    disabled={!editor.can().chain().focus().toggleBold().run()}
                    pressed={editor.isActive('bold')}
                >
                    <Bold className="h-4 w-4" />
                </Toggle>

                <Toggle
                    size="sm"
                    className="mr-1"
                    onPressedChange={() => editor.chain().focus().toggleItalic().run()}
                    disabled={!editor.can().chain().focus().toggleItalic().run()}
                    pressed={editor.isActive('italic')}
                    value="italic"
                >
                    <Italic className="h-4 w-4" />
                </Toggle>

                <Toggle
                    size="sm"
                    className="mr-1"
                    onPressedChange={() => editor.chain().focus().toggleStrike().run()}
                    disabled={!editor.can().chain().focus().toggleStrike().run()}
                    pressed={editor.isActive('strike')}
                >
                    <Strikethrough className="h-4 w-4" />
                </Toggle>

                <Toggle
                    size="sm"
                    className="mr-1"
                    onPressedChange={() => editor.chain().focus().toggleBulletList().run()}
                    pressed={editor.isActive('bulletList')}
                >
                    <List className="h-4 w-4" />
                </Toggle>

                <Toggle
                    size="sm"
                    className="mr-1"
                    onPressedChange={() => editor.chain().focus().toggleOrderedList().run()}
                    pressed={editor.isActive('orderedList')}
                >
                    <ListOrdered className="h-4 w-4" />
                </Toggle>

                <Toggle
                    size="sm"
                    className="mr-1"
                    onPressedChange={() => editor.chain().focus().toggleCodeBlock().run()}
                    pressed={editor.isActive('codeBlock')}
                >
                    <Code className="h-4 w-4" />
                </Toggle>

                <Toggle
                    size="sm"
                    className="mr-1"
                    onPressedChange={() => editor.chain().focus().toggleBlockquote().run()}
                    pressed={editor.isActive('blockquote')}
                >
                    <Quote className="h-4 w-4" />
                </Toggle>

                <Toggle
                    size="sm"
                    className="mr-1"
                    onPressedChange={() => editor.chain().focus().setHorizontalRule().run()}
                >
                    <Minus className="h-4 w-4" />
                </Toggle>

                {/* <FormatType editor={editor} /> */}
            </ToggleGroup>

            <div className="flex items-center gap-2">
                <ToggleGroup
                    className="invisible flex flex-row items-center sm:visible"
                    type="multiple"
                >
                    <Toggle
                        size="sm"
                        className="mr-1"
                        onPressedChange={() => editor.chain().focus().undo().run()}
                        disabled={!editor.can().chain().focus().undo().run()}
                    >
                        <Undo className="h-4 w-4" />
                    </Toggle>

                    <Toggle
                        size="sm"
                        className="mr-1"
                        onPressedChange={() => editor.chain().focus().redo().run()}
                        disabled={!editor.can().chain().focus().redo().run()}
                    >
                        <Redo className="h-4 w-4" />
                    </Toggle>
                </ToggleGroup>

                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSave}
                    className="flex items-center gap-1"
                >
                    <Save className="h-4 w-4" />
                    <span className="hidden sm:inline">{t('save')}</span>
                </Button>
            </div>
        </Toolbar>
    );
};

export default EditorToolbar;
