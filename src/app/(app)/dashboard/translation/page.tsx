import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import TextTranslationTable from './components/text-translation-table';
import { useTranslations } from 'next-intl';

const translationTable = () => {
    const t = useTranslations('Dashboard');

    return (
        <ScrollArea className="h-screen w-full">
            <div className="flex w-full flex-col">
                <h2 className="p-1 text-2xl font-semibold tracking-tight text-foreground">
                    {t('textTranslation')}
                </h2>
                <p className="p-1 text-sm font-medium text-foreground">
                    {t('textTranslationDesc')}
                </p>
                <TextTranslationTable />
            </div>
        </ScrollArea>
    );
};

export default translationTable;
