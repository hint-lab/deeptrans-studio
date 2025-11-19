"use client";
import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";
import { Icons } from "@/components/icons";
import { cn } from "@/lib/utils";
import { TranslationStage } from "@/store/features/translationSlice";
import { getTranslationStageLabel } from "@/constants/translationStages";

import { useTranslations } from "next-intl";
interface RunMenuProps {
    isRunning: boolean;
    currentStage: TranslationStage | null;
    setIsRunning: (isRunning: boolean) => void;
    onTranslationAction: (isRunning: boolean) => void;
    mounted: boolean;
}

export function RunMenu({ isRunning, currentStage, setIsRunning, onTranslationAction, mounted }: RunMenuProps) {
    const tStage = useTranslations('IDE.translationStages');
    const Icon = isRunning ? Icons.spinner : Play;
    const buttonText = isRunning
        ? currentStage ? getTranslationStageLabel(currentStage, tStage) : '' : '';

    const handleClick = () => {
        if (!isRunning) {
            setIsRunning(true);
        }
        onTranslationAction(isRunning);
    };

    return (
        <Button
            variant={isRunning ? "secondary" : "default"}
            size="sm"
            onClick={handleClick}
            aria-label={buttonText}
            disabled={isRunning}
            className={cn(
                "w-8 md:w-24 gap-0 md:gap-2 px-2 md:px-3 relative overflow-hidden transition-all duration-300 transform",
                isRunning ? "bg-indigo-100 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-700" : "hover:scale-105 active:scale-95 hover:shadow-md",
                "after:content-[''] after:absolute after:inset-0 after:bg-white/0 hover:after:bg-white/10 active:after:bg-white/20 after:transition-colors z-10"
            )}
        >
            <Icon
                size="16"
                className={cn(
                    "shrink-0 flex-none transition-all duration-300",
                    isRunning ? "animate-spin text-indigo-600 dark:text-indigo-400" : "group-hover:text-white"
                )}
            />
            <span className={cn(
                "hidden md:inline transition-all duration-300",
                isRunning && "text-indigo-600 dark:text-indigo-400 font-medium"
            )}>
                {buttonText}
            </span>
            {/* 运行按钮不再显示进度条，只保留旋转图标 */}
        </Button>
    );
} 