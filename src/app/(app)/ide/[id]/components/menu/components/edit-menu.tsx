import { MenubarMenu, MenubarTrigger, MenubarContent, MenubarItem, MenubarSeparator } from "@/components/ui/menubar";
import { useTargetEditor } from "@/hooks/useEditor";
import { useActiveDocumentItem } from "@/hooks/useActiveDocumentItem";
import { updateDocItemStatusAction } from "@/actions/document-item";
import { useTranslationState } from "@/hooks/useTranslation";
import { useTranslations } from 'next-intl';

export function EditMenu() {
    const t = useTranslations('IDE.menu');
    const tEditor = useTranslations('IDE.editor');
    const target = useTargetEditor();
    const { activeDocumentItem } = useActiveDocumentItem();
    const { currentStage, setCurrentStage } = useTranslationState();

    const undo = () => target.editor?.chain().focus().undo().run();
    const redo = () => target.editor?.chain().focus().redo().run();
    const cut = () => document.execCommand('cut');
    const copy = () => document.execCommand('copy');
    const paste = () => document.execCommand('paste');

    const handleRollback = async () => {
        const id = (activeDocumentItem as any)?.id;
        if (!id) return;
        const mapping: Record<string, { to?: string; prev?: string }> = {
            'QA': { to: 'MT', prev: 'MT' },
            'POST_EDIT': { to: 'QA', prev: 'QA' },
            'COMPLETED': { to: 'POST_EDIT', prev: 'POST_EDIT' },
        };
        const m = mapping[currentStage as string];
        if (!m?.to) return;
        try {
            await updateDocItemStatusAction(id, m.to);
            if (m.prev) setCurrentStage(m.prev as any);
        } catch { }
    };

    const handleAdvance = async () => {
        const id = (activeDocumentItem as any)?.id;
        if (!id) return;
        const mapping: Record<string, { to?: string; next?: string }> = {
            'MT': { to: 'QA', next: 'QA' },
            'QA': { to: 'POST_EDIT', next: 'POST_EDIT' },
            'POST_EDIT': { to: 'COMPLETED', next: 'COMPLETED' },
        };
        const m = mapping[currentStage as string];
        if (!m?.to) return;
        try {
            await updateDocItemStatusAction(id, m.to);
            if (m.next) setCurrentStage(m.next as any);
        } catch { }
    };

    return (
        <MenubarMenu>
            <MenubarTrigger><span className="flex items-center whitespace-nowrap gap-2">{t('edit')}</span></MenubarTrigger>
            <MenubarContent>
                <MenubarItem onClick={undo}>{tEditor('undo')}</MenubarItem>
                <MenubarItem onClick={redo}>{tEditor('redo')}</MenubarItem>
                <MenubarItem onClick={cut}>{tEditor('cut')}</MenubarItem>
                <MenubarItem onClick={copy}>{tEditor('copy')}</MenubarItem>
                <MenubarItem onClick={paste}>{tEditor('paste')}</MenubarItem>
                <MenubarSeparator />
                <MenubarItem onClick={handleRollback}>{tEditor('rollback')}</MenubarItem>
                <MenubarItem onClick={handleAdvance}>{tEditor('advance')}</MenubarItem>
            </MenubarContent>
        </MenubarMenu>
    );
}