'use client';
import { Button } from '@/components/ui/button';
import { Play } from 'lucide-react';
import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';
import { TranslationStage } from '@/store/features/translationSlice';
import { getTranslationStageLabel } from '@/constants/translationStages';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTranslations } from 'next-intl';
interface RunMenuProps {
    isRunning: boolean;
    currentStage: TranslationStage | null;
    setIsRunning: (isRunning: boolean) => void;
    onTranslationAction: (isRunning: boolean) => void;
    mounted: boolean;
}

export function RunMenu({
    isRunning,
    currentStage,
    setIsRunning,
    onTranslationAction,
    mounted,
}: RunMenuProps) {
    const tStage = useTranslations('IDE.translationStages');
    const Icon = isRunning ? Icons.spinner : Play;
    const buttonText = isRunning
        ? currentStage
            ? getTranslationStageLabel(currentStage, tStage)
            : ''
        : '';

    const handleClick = () => {
        if (!isRunning) {
            setIsRunning(true);
        }
        onTranslationAction(isRunning);
    };

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant={isRunning ? 'secondary' : 'default'}
                        size="sm"
                        onClick={handleClick}
                        aria-label={buttonText}
                        disabled={isRunning}
                        className={cn(
                            'relative w-8 transform gap-0 overflow-hidden px-2 transition-all duration-300 md:w-24 md:gap-2 md:px-3',
                            isRunning
                                ? 'border-indigo-300 bg-indigo-100 dark:border-indigo-700 dark:bg-indigo-900/30'
                                : 'hover:scale-105 hover:shadow-md active:scale-95',
                            "z-10 after:absolute after:inset-0 after:bg-white/0 after:transition-colors after:content-[''] hover:after:bg-white/10 active:after:bg-white/20"
                        )}
                    >
                        <Icon
                            size="16"
                            className={cn(
                                'flex-none shrink-0 transition-all duration-300',
                                isRunning
                                    ? 'animate-spin text-indigo-600 dark:text-indigo-400'
                                    : 'group-hover:text-white'
                            )}
                        />
                        <span
                            className={cn(
                                'hidden transition-all duration-300 md:inline',
                                isRunning && 'font-medium text-indigo-600 dark:text-indigo-400'
                            )}
                        >
                            {buttonText}
                        </span>
                        {/* 运行按钮不再显示进度条，只保留旋转图标 */}
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="start">
                    <p className="text-sm font-medium">
                        {tStage('oneClickCompletion') || '一键完成'}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {tStage('oneClickCompletionDesc') || '从当前分段开始，自动完成所有后续流程'}
                    </p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
