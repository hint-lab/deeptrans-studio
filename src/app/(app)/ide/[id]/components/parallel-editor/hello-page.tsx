import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { HelpCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function TranslationGuideButton({ className }: { className?: string }) {
    const t = useTranslations('IDE.hello');
    const steps = ['select', 'confirm', 'advance'] as const;

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn(
                        'size-7 shrink-0 rounded-sm p-0 text-muted-foreground hover:text-foreground',
                        className
                    )}
                    aria-label={t('guide')}
                    title={t('guide')}
                >
                    <HelpCircle className="size-4" aria-hidden="true" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                align="end"
                side="bottom"
                className="w-80 max-w-[calc(100vw-2rem)] p-0"
                aria-labelledby="parallel-editor-guide-title"
                aria-describedby="parallel-editor-guide-description"
            >
                <div className="border-b px-4 py-3.5">
                    <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                        {t('guide')}
                    </p>
                    <h2
                        id="parallel-editor-guide-title"
                        className="mt-1 text-sm font-semibold text-foreground"
                    >
                        {t('title')}
                    </h2>
                    <p
                        id="parallel-editor-guide-description"
                        className="mt-1 text-xs leading-5 text-muted-foreground"
                    >
                        {t('description')}
                    </p>
                </div>
                <ol className="divide-y" aria-label={t('title')}>
                    {steps.map((step, index) => (
                        <li key={step} className="flex items-start gap-3 px-4 py-3">
                            <span
                                className="flex size-5 shrink-0 items-center justify-center rounded-full border bg-muted text-[10px] font-semibold text-muted-foreground"
                                aria-hidden="true"
                            >
                                {index + 1}
                            </span>
                            <div className="min-w-0">
                                <p className="text-xs font-medium text-foreground">
                                    {t(`steps.${step}.title`)}
                                </p>
                                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                                    {t(`steps.${step}.description`)}
                                </p>
                            </div>
                        </li>
                    ))}
                </ol>
            </PopoverContent>
        </Popover>
    );
}
