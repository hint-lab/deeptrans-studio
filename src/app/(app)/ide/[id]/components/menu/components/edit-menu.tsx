import { MenubarContent, MenubarItem, MenubarMenu, MenubarTrigger } from '@/components/ui/menubar';
import { useTargetEditor } from '@/hooks/useEditor';
import { useTranslations } from 'next-intl';

export function EditMenu() {
    const t = useTranslations('IDE.menu');
    const tEditor = useTranslations('IDE.editor');
    const target = useTargetEditor();

    const undo = () => target.editor?.chain().focus().undo().run();
    const redo = () => target.editor?.chain().focus().redo().run();
    const cut = () => document.execCommand('cut');
    const copy = () => document.execCommand('copy');
    const paste = () => document.execCommand('paste');

    return (
        <MenubarMenu>
            <MenubarTrigger>
                <span className="flex cursor-pointer items-center gap-2 whitespace-nowrap hover:opacity-90">
                    {t('edit')}
                </span>
            </MenubarTrigger>
            <MenubarContent>
                <MenubarItem onClick={undo}>{tEditor('undo')}</MenubarItem>
                <MenubarItem onClick={redo}>{tEditor('redo')}</MenubarItem>
                <MenubarItem onClick={cut}>{tEditor('cut')}</MenubarItem>
                <MenubarItem onClick={copy}>{tEditor('copy')}</MenubarItem>
                <MenubarItem onClick={paste}>{tEditor('paste')}</MenubarItem>
            </MenubarContent>
        </MenubarMenu>
    );
}
