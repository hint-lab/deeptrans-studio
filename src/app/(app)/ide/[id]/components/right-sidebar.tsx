import Link from 'next/link';
import React, { useState } from 'react';
import {
    MailIcon,
    User,
    Settings,
    FileSearch,
    ScanEye,
    LayoutGrid,
    Columns,
    Rows,
    Wand,
} from 'lucide-react';
import { type LucideProps } from 'lucide-react';
import { useRightPanel } from '@/hooks/useRightPanel';
import { useTranslations } from 'next-intl';
interface SidebarItem {
    Icon: React.ComponentType<LucideProps>;
    path: string;
}
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { IdeSettingsModal } from './settings/ide-settings-modal';
import { HelpCircle } from 'lucide-react';

const sidebarBottomItems: SidebarItem[] = [
    {
        Icon: User,
        path: '/about',
    },
    {
        Icon: Settings,
        path: '/settings',
    },
];

const RightSidebar: React.FC = () => {
    const t = useTranslations('IDE.rightSidebar');
    const { mode, toggleChatMode, togglePreviewMode, toggleHelpMode } = useRightPanel() as any;
    const [contactOpen, setContactOpen] = useState(false);
    const [contactTitle, setContactTitle] = useState('');
    const [contactMessage, setContactMessage] = useState('');
    const [isVertical, setIsVertical] = useState(true);
    const [settingsOpen, setSettingsOpen] = useState(false);
    return (
        <div className="flex size-full flex-col items-center justify-between bg-transparent">
            <div className="flex flex-col items-center">
                <div className="flex items-center justify-center p-1">
                    <Button
                        variant="default"
                        onClick={() => {
                            toggleChatMode();
                        }}
                        className={`group relative h-6 w-6 overflow-hidden bg-gradient-to-b from-blue-500 to-purple-500 px-1 py-2 transition-all duration-200 hover:scale-105 hover:from-blue-600 hover:to-purple-600 active:scale-95 ${mode === 'chat' ? 'ring-2 ring-blue-300/60' : ''}`}
                        asChild
                    >
                        <div className="flex flex-col items-center justify-center px-1">
                            <span className="absolute inset-0 bg-white/20 opacity-0 transition-opacity group-hover:opacity-100 group-active:opacity-30"></span>
                            <Wand size="16" className="mb-1 group-hover:animate-pulse" />
                        </div>
                    </Button>
                </div>
                <div className="mt-4 flex flex-col gap-4">
                    {/* Help 文档（小按钮样式，统一风格） */}
                    <button
                        aria-label={t('previewPanel')}
                        className={`rounded ${mode === 'help' ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-muted/40'}`}
                        onClick={() => {
                            toggleHelpMode();
                        }}
                        aria-pressed={mode === 'help'}
                    >
                        <HelpCircle className="text-foreground" size="16" />
                    </button>
                    {/* 文件预览 */}
                    <button
                        aria-label={t('previewPanel')}
                        className={`rounded ${mode === 'preview' ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-muted/40'}`}
                        onClick={() => {
                            togglePreviewMode();
                        }}
                        aria-pressed={mode === 'preview'}
                    >
                        <FileSearch className="text-foreground" size="16" />
                    </button>
                    {/* 文件定位 */}
                    {/* <Link href="#" onClick={(e) => { e.preventDefault(); const el = document.querySelector('[data-explorer]'); (el as any)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }); }}>
            <ScanEye className="text-foreground" size="16" />
          </Link> */}
                    {/* 排版切换（上下/左右） */}
                    <button
                        aria-label={t('toggleLayout')}
                        className={`rounded ${isVertical ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-muted/40'}`}
                        onClick={() => {
                            const ev = new CustomEvent('layout:toggle');
                            window.dispatchEvent(ev);
                            setIsVertical(v => !v);
                        }}
                        aria-pressed={isVertical}
                    >
                        {isVertical ? (
                            <Rows className="text-foreground" size="16" />
                        ) : (
                            <Columns className="text-foreground" size="16" />
                        )}
                    </button>
                    {/* 联系客服 */}
                    <button onClick={() => setContactOpen(true)} aria-label={t('contactSupport')}>
                        <MailIcon className="text-foreground" size="16" />
                    </button>
                </div>
            </div>
            <div className="mb-4 flex flex-col gap-4">
                {sidebarBottomItems.map(({ Icon, path }) => (
                    <Link
                        href={path}
                        key={path}
                        onClick={e => {
                            if (path === '/settings') {
                                e.preventDefault();
                                setSettingsOpen(true);
                            }
                        }}
                        passHref
                    >
                        <div className={''}>
                            <Icon className="text-foreground" size="16" />
                        </div>
                    </Link>
                ))}
            </div>
            <Dialog open={contactOpen} onOpenChange={setContactOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('contact.title')}</DialogTitle>
                        <DialogDescription>{t('contact.description')}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Input
                            placeholder={t('contact.titlePlaceholder')}
                            value={contactTitle}
                            onChange={e => setContactTitle(e.target.value)}
                        />
                        <Textarea
                            rows={6}
                            placeholder={t('contact.messagePlaceholder')}
                            value={contactMessage}
                            onChange={e => setContactMessage(e.target.value)}
                        />
                        <div className="flex justify-end gap-2 pt-2">
                            <Button variant="outline" onClick={() => setContactOpen(false)}>
                                {t('contact.cancel')}
                            </Button>
                            <Button
                                onClick={() => {
                                    console.log('send mail:', { contactTitle, contactMessage });
                                    setContactOpen(false);
                                    setContactTitle('');
                                    setContactMessage('');
                                }}
                            >
                                {t('contact.send')}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
            <IdeSettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
        </div>
    );
};

export default RightSidebar;
