import Link from 'next/link';
import { Command } from 'lucide-react';
import { Button } from 'src/components/ui/button';
import { useTranslations } from 'next-intl';
export default function Hello() {
    const t = useTranslations('IDE.hello');
    return (
        <div className="mt-24 flex flex-row items-center justify-center text-foreground">
            <div className="flex flex-col">
                <div className="mb-3 text-center">
                    <div className="gradient-text mb-4 text-4xl font-bold">{t('title')}</div>

                    <h1 className="mb-2">{t('subtitle')}</h1>
                    <p className="mb-4 text-sm">{t('description')}</p>
                </div>
                <div className="mt-4 flex items-center justify-center space-y-4">
                    <div className="flex flex-col justify-between space-y-2 text-left">
                        <div className="mx-auto flex">
                            <button className="gradient-text text-xl font-bold">
                                {t('aiSidebarChat')}
                            </button>
                        </div>
                        <div className="flex flex-row items-center justify-start gap-2">
                            <Button variant="ghost">{t('showAllCommands')}</Button>{' '}
                            <Command size="16" />
                        </div>
                        <div className="flex flex-row items-center justify-start gap-2">
                            <Button variant="ghost">{t('goToFile')}</Button> <Command size="16" />
                        </div>
                        <div className="flex flex-row items-center justify-start gap-2">
                            <Button variant="ghost">{t('showSettings')}</Button>{' '}
                            <Command size="16" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
