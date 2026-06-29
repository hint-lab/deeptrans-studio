import { useEffect, useState } from 'react';
import { useExplorerTabs } from '@/hooks/useExplorerTabs';
import { useTranslations } from 'next-intl';
import {
    TRANSLATION_STAGE_PROGRESS_GROUPS,
    getTranslationStageGroup,
    type TranslationStageGroup,
} from '@/constants/translationStages';

type Tasks = 'preTrans' | 'polishTrans' | 'verifyTrans' | 'none';

const Footer = () => {
    const t = useTranslations('IDE');

    const [currentTask, setCurrentTask] = useState<Tasks>('none');

    const [progress, setProgress] = useState<number>(0);
    const emptyCounts = (): Record<TranslationStageGroup, number> =>
        TRANSLATION_STAGE_PROGRESS_GROUPS.reduce(
            (acc, group) => ({ ...acc, [group.key]: 0 }),
            {} as Record<TranslationStageGroup, number>
        );
    const [counts, setCounts] = useState<Record<TranslationStageGroup, number>>(emptyCounts);
    const { explorerTabs } = useExplorerTabs();

    // 基于当前文档项状态，计算整体进度与分布
    useEffect(() => {
        const tabs = explorerTabs?.documentTabs ?? [];
        const allItems = tabs.flatMap(t => t.items ?? []);
        const total = allItems.length;
        if (!total) {
            setProgress(0);
            setCounts(emptyCounts());
            return;
        }
        const nextCounts = allItems.reduce((acc: Record<TranslationStageGroup, number>, it: any) => {
            const status = (it?.status as string) || 'NOT_STARTED';
            const group = getTranslationStageGroup(status);
            acc[group] = (acc[group] || 0) + 1;
            return acc;
        }, emptyCounts());
        setCounts(nextCounts);
        const approvedCount = nextCounts.signoff || 0;
        const approvedPercent = Math.round((approvedCount / total) * 100);
        setProgress(approvedPercent);
    }, [explorerTabs]);
    return (
        <footer className="h-6 w-full">
            <div className="flex h-full w-full items-center gap-3 px-3">
                {/* 左：浅紫线性进度条 */}
                <div className="relative h-full flex-1">
                    <div className="absolute inset-y-0 left-0 right-0 flex items-center">
                        <div
                            className={`h-2 w-full overflow-hidden rounded font-semibold ${progress >= 100 ? 'bg-emerald-200 dark:bg-emerald-900/30' : 'bg-indigo-200 dark:bg-indigo-900/40'}`}
                        >
                            <div
                                className={`h-full bg-gradient-to-r font-semibold ${progress >= 100 ? 'from-emerald-400 to-emerald-600' : 'from-indigo-400 to-indigo-600'}`}
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>
                    {/* 进度值叠加显示 */}
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <span className="text-[10px] leading-none text-foreground/80">
                            {progress}%
                        </span>
                    </div>
                </div>
                {/* 右：各子状态统计（常显） */}
                <div className="flex shrink-0 items-center gap-2 pr-8 text-[10px] leading-[10px]">
                    {TRANSLATION_STAGE_PROGRESS_GROUPS.map(group => (
                        <span
                            key={group.key}
                            className={`inline-flex items-center gap-1 ${group.textClass}`}
                        >
                            <span className={`inline-block h-2 w-2 rounded ${group.dotClass}`} />
                            {t(`statusProgress.${group.labelKey}`)} {counts[group.key] || 0}
                        </span>
                    ))}
                </div>
            </div>
        </footer>
    );
};

export default Footer;
