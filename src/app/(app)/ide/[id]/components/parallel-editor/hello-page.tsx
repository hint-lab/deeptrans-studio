import { ChevronRight, Languages } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function Hello() {
    const t = useTranslations('IDE.hello');
    const steps = ['select', 'confirm', 'advance'] as const;

    return (
        <main className="flex min-h-full items-center justify-center px-5 py-10 text-foreground">
            <section
                className="w-full max-w-xl rounded-xl border border-border/80 bg-card p-6 shadow-sm"
                aria-labelledby="parallel-editor-welcome-title"
                aria-describedby="parallel-editor-welcome-description"
            >
                <div className="flex items-start gap-4">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted/70 text-primary">
                        <Languages className="size-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                            DeepTrans Studio
                        </p>
                        <h1
                            id="parallel-editor-welcome-title"
                            className="mt-1 text-xl font-semibold tracking-tight"
                        >
                            {t('title')}
                        </h1>
                        <p className="mt-1 text-sm font-medium text-foreground/80">
                            {t('subtitle')}
                        </p>
                    </div>
                </div>
                <p
                    id="parallel-editor-welcome-description"
                    className="mt-5 text-sm leading-6 text-muted-foreground"
                >
                    {t('description')}
                </p>

                <ol className="mt-6 divide-y border-y" aria-label={t('title')}>
                    {steps.map((step, index) => (
                        <li key={step} className="flex items-start gap-3 py-3 first:pt-3 last:pb-3">
                            <span
                                className="flex size-5 shrink-0 items-center justify-center rounded-full border bg-muted text-[10px] font-semibold text-muted-foreground"
                                aria-hidden="true"
                            >
                                {index + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-foreground">
                                    {t(`steps.${step}.title`)}
                                </p>
                                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                                    {t(`steps.${step}.description`)}
                                </p>
                            </div>
                            {index < steps.length - 1 && (
                                <ChevronRight
                                    className="mt-0.5 size-4 shrink-0 text-muted-foreground/50"
                                    aria-hidden="true"
                                />
                            )}
                        </li>
                    ))}
                </ol>
            </section>
        </main>
    );
}
