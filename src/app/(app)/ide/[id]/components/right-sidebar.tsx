import React, { useState } from 'react';
import { User, Settings, FileSearch, Wand } from 'lucide-react';
import { useRightPanel } from '@/hooks/useRightPanel';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { IdeSettingsModal } from './settings/ide-settings-modal';
import { HelpCircle } from 'lucide-react';
import { AboutDialog } from './about-dialog';

const RightSidebar: React.FC = () => {
    const t = useTranslations('IDE.rightSidebar');
    const { mode, toggleChatMode, togglePreviewMode, toggleHelpMode } = useRightPanel() as any;
    const [aboutOpen, setAboutOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    return (
        <div className="flex size-full flex-col items-center justify-between bg-transparent">
            <div className="flex flex-col items-center">
                <div className="flex items-center justify-center p-1">
                    <Button
                        variant="default"
                        type="button"
                        aria-label={t('chat')}
                        aria-pressed={mode === 'chat'}
                        title={t('chat')}
                        onClick={() => {
                            toggleChatMode();
                        }}
                        className={`group relative h-6 w-6 overflow-hidden bg-gradient-to-b from-blue-500 to-purple-500 px-1 py-2 transition-all duration-200 hover:scale-105 hover:from-blue-600 hover:to-purple-600 active:scale-95 ${mode === 'chat' ? 'ring-2 ring-blue-300/60' : ''}`}
                    >
                        <span className="flex flex-col items-center justify-center px-1">
                            <span
                                aria-hidden="true"
                                className="absolute inset-0 bg-white/20 opacity-0 transition-opacity group-hover:opacity-100 group-active:opacity-30"
                            />
                            <Wand
                                aria-hidden="true"
                                size="16"
                                className="mb-1 group-hover:animate-pulse"
                            />
                        </span>
                    </Button>
                </div>
                <div className="mt-4 flex flex-col gap-4">
                    {/* Help 文档（小按钮样式，统一风格） */}
                    <button
                        type="button"
                        aria-label={t('help')}
                        aria-pressed={mode === 'help'}
                        title={t('help')}
                        className={`rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${mode === 'help' ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-muted/40'}`}
                        onClick={() => {
                            toggleHelpMode();
                        }}
                    >
                        <HelpCircle aria-hidden="true" className="text-foreground" size="16" />
                    </button>
                    {/* 文件预览 */}
                    <button
                        type="button"
                        aria-label={t('preview')}
                        aria-pressed={mode === 'preview'}
                        title={t('preview')}
                        className={`rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${mode === 'preview' ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-muted/40'}`}
                        onClick={() => {
                            togglePreviewMode();
                        }}
                    >
                        <FileSearch aria-hidden="true" className="text-foreground" size="16" />
                    </button>
                </div>
            </div>
            <div className="mb-4 flex flex-col gap-4">
                <button
                    type="button"
                    aria-label={t('about')}
                    title={t('about')}
                    className="rounded text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                    onClick={() => setAboutOpen(true)}
                >
                    <User aria-hidden="true" className="text-foreground" size="16" />
                </button>
                <button
                    type="button"
                    aria-label={t('settings')}
                    title={t('settings')}
                    className="rounded text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                    onClick={() => setSettingsOpen(true)}
                >
                    <Settings aria-hidden="true" className="text-foreground" size="16" />
                </button>
            </div>
            <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
            <IdeSettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
        </div>
    );
};

export default RightSidebar;
