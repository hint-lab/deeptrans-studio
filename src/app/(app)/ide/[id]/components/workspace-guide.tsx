'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useActiveDocumentItem } from '@/hooks/useActiveDocumentItem';
import { useSidebar } from '@/hooks/useSidebar';
import { ChevronLeft, ChevronRight, Lightbulb, X } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

const GUIDE_STORAGE_VERSION = 'v1';

const GUIDE_STEPS = [
    { key: 'select', target: '#ide-explorer-panel' },
    { key: 'stage', target: '[data-workspace-guide-target="stage-overview"]' },
    { key: 'advance', target: '[data-workspace-guide-target="stage-actions"]' },
] as const;

type GuideTargetRect = {
    top: number;
    left: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
};

type WorkspaceGuideContextValue = {
    openGuide: () => void;
};

const WorkspaceGuideContext = createContext<WorkspaceGuideContextValue | null>(null);

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}

function readTargetRect(selector: string): GuideTargetRect | null {
    const target = document.querySelector<HTMLElement>(selector);
    if (!target) return null;

    const rect = target.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;

    const padding = 8;
    const top = clamp(rect.top - padding, 0, window.innerHeight);
    const left = clamp(rect.left - padding, 0, window.innerWidth);
    const right = clamp(rect.right + padding, 0, window.innerWidth);
    const bottom = clamp(rect.bottom + padding, 0, window.innerHeight);

    return {
        top,
        left,
        right,
        bottom,
        width: right - left,
        height: bottom - top,
    };
}

function getCalloutPosition(step: number, target: GuideTargetRect | null) {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const calloutWidth = Math.min(320, viewportWidth - 32);
    const calloutHeight = 212;

    if (!target) {
        return {
            left: Math.max(16, (viewportWidth - calloutWidth) / 2),
            top: Math.max(16, (viewportHeight - calloutHeight) / 2),
        };
    }

    if (step === 0) {
        const rightSide = target.right + 16;
        return {
            left: clamp(
                rightSide + calloutWidth <= viewportWidth - 16 ? rightSide : target.left + 16,
                16,
                viewportWidth - calloutWidth - 16
            ),
            top: clamp(target.top + 16, 16, viewportHeight - calloutHeight - 16),
        };
    }

    const below = target.bottom + 16;
    return {
        left: clamp(target.right - calloutWidth, 16, viewportWidth - calloutWidth - 16),
        top: clamp(
            below + calloutHeight <= viewportHeight - 16 ? below : target.top - calloutHeight - 16,
            16,
            viewportHeight - calloutHeight - 16
        ),
    };
}

function WorkspaceGuideOverlay({
    open,
    stepIndex,
    hasActiveSegment,
    onBack,
    onNext,
    onClose,
}: {
    open: boolean;
    stepIndex: number;
    hasActiveSegment: boolean;
    onBack: () => void;
    onNext: () => void;
    onClose: () => void;
}) {
    const t = useTranslations('IDE.workspaceGuide');
    const [targetRect, setTargetRect] = useState<GuideTargetRect | null>(null);
    const guideRef = useRef<HTMLElement>(null);
    const step = GUIDE_STEPS[stepIndex];
    const isFirstStep = stepIndex === 0;
    const isFinalStep = stepIndex === GUIDE_STEPS.length - 1;
    const nextDisabled = isFirstStep && !hasActiveSegment;

    useEffect(() => {
        if (!open) return;

        let frame = 0;
        const updateTarget = () => {
            window.cancelAnimationFrame(frame);
            frame = window.requestAnimationFrame(() => setTargetRect(readTargetRect(step.target)));
        };
        const observer = new ResizeObserver(updateTarget);
        const target = document.querySelector<HTMLElement>(step.target);

        observer.observe(document.body);
        if (target) observer.observe(target);
        window.addEventListener('resize', updateTarget);
        window.addEventListener('scroll', updateTarget, true);

        return () => {
            window.cancelAnimationFrame(frame);
            observer.disconnect();
            window.removeEventListener('resize', updateTarget);
            window.removeEventListener('scroll', updateTarget, true);
        };
    }, [open, step.target]);

    useEffect(() => {
        if (!open) return;
        const frame = window.requestAnimationFrame(() => guideRef.current?.focus());
        return () => window.cancelAnimationFrame(frame);
    }, [open, stepIndex]);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onClose, open]);

    if (!open) return null;

    const calloutPosition = getCalloutPosition(stepIndex, targetRect);
    const targetMiddleHeight = targetRect ? targetRect.bottom - targetRect.top : 0;

    return (
        <div className="pointer-events-none fixed inset-0 z-[100]" aria-live="polite">
            {targetRect ? (
                <>
                    <div
                        className="pointer-events-auto fixed left-0 top-0 bg-slate-950/45 dark:bg-black/65"
                        style={{ width: '100%', height: targetRect.top }}
                    />
                    <div
                        className="pointer-events-auto fixed left-0 bg-slate-950/45 dark:bg-black/65"
                        style={{ top: targetRect.top, width: targetRect.left, height: targetMiddleHeight }}
                    />
                    <div
                        className="pointer-events-auto fixed bg-slate-950/45 dark:bg-black/65"
                        style={{
                            top: targetRect.top,
                            left: targetRect.right,
                            right: 0,
                            height: targetMiddleHeight,
                        }}
                    />
                    <div
                        className="pointer-events-auto fixed bottom-0 left-0 bg-slate-950/45 dark:bg-black/65"
                        style={{ top: targetRect.bottom, width: '100%' }}
                    />
                    <div
                        className="pointer-events-none fixed rounded-md border-2 border-primary/90 shadow-[0_0_0_4px_rgba(124,58,237,0.2)]"
                        style={{
                            top: targetRect.top,
                            left: targetRect.left,
                            width: targetRect.width,
                            height: targetRect.height,
                        }}
                        aria-hidden="true"
                    />
                </>
            ) : (
                <div className="pointer-events-auto fixed inset-0 bg-slate-950/45 dark:bg-black/65" />
            )}

            <section
                ref={guideRef}
                tabIndex={-1}
                role="dialog"
                aria-labelledby="workspace-guide-title"
                aria-describedby="workspace-guide-description"
                className="pointer-events-auto fixed z-[102] w-80 max-w-[calc(100vw-2rem)] rounded-lg border bg-popover p-4 text-popover-foreground shadow-2xl outline-none"
                style={calloutPosition}
            >
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground">
                            {t('progress', {
                                current: stepIndex + 1,
                                total: GUIDE_STEPS.length,
                            })}
                        </p>
                        <h2 id="workspace-guide-title" className="mt-1 text-sm font-semibold">
                            {t(`steps.${step.key}.title`)}
                        </h2>
                    </div>
                    <button
                        type="button"
                        className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={onClose}
                        aria-label={t('skip')}
                        title={t('skip')}
                    >
                        <X className="size-4" aria-hidden="true" />
                    </button>
                </div>

                <p
                    id="workspace-guide-description"
                    className="mt-3 text-sm leading-6 text-muted-foreground"
                >
                    {t(`steps.${step.key}.description`)}
                </p>
                {nextDisabled && (
                    <p className="mt-2 text-xs leading-5 text-primary">{t('selectFirst')}</p>
                )}

                <div className="mt-4 flex items-center justify-between gap-2 border-t pt-3">
                    <button
                        type="button"
                        className="text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={onClose}
                    >
                        {t('skip')}
                    </button>
                    <div className="flex items-center gap-2">
                        {!isFirstStep && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 gap-1 px-2 text-xs"
                                onClick={onBack}
                            >
                                <ChevronLeft className="size-3.5" aria-hidden="true" />
                                {t('back')}
                            </Button>
                        )}
                        <Button
                            type="button"
                            size="sm"
                            className={cn('h-7 gap-1 px-2 text-xs', nextDisabled && 'cursor-not-allowed')}
                            onClick={onNext}
                            disabled={nextDisabled}
                        >
                            {isFinalStep ? t('finish') : t('next')}
                            {!isFinalStep && <ChevronRight className="size-3.5" aria-hidden="true" />}
                        </Button>
                    </div>
                </div>
            </section>
        </div>
    );
}

export function WorkspaceGuideProvider({ children }: { children: React.ReactNode }) {
    const { activeDocumentItem } = useActiveDocumentItem();
    const { data: session, status } = useSession();
    const { isSidebarOpen, toggleSidebar } = useSidebar();
    const [isOpen, setIsOpen] = useState(false);
    const [stepIndex, setStepIndex] = useState(0);
    const autoOpenKeyRef = useRef<string | null>(null);
    const selectedDuringThisTourRef = useRef(false);
    const activeItemId = String(activeDocumentItem?.id || '');
    const hasActiveSegment = Boolean(activeItemId);
    const userId = String(session?.user?.id || '');
    const storageKey = userId
        ? `deeptrans:workspace-guide:${GUIDE_STORAGE_VERSION}:${userId}`
        : null;

    const markGuideSeen = useCallback(() => {
        if (!storageKey) return;
        try {
            window.localStorage.setItem(storageKey, 'seen');
        } catch {}
    }, [storageKey]);

    const openGuide = useCallback(() => {
        if (!isSidebarOpen) toggleSidebar();
        selectedDuringThisTourRef.current = !hasActiveSegment;
        setStepIndex(0);
        setIsOpen(true);
    }, [hasActiveSegment, isSidebarOpen, toggleSidebar]);

    const closeGuide = useCallback(() => {
        markGuideSeen();
        setIsOpen(false);
    }, [markGuideSeen]);

    const visibleStepIndex =
        stepIndex === 0 && selectedDuringThisTourRef.current && hasActiveSegment
            ? 1
            : stepIndex;

    const nextStep = useCallback(() => {
        if (visibleStepIndex === 0 && !hasActiveSegment) return;
        if (visibleStepIndex === GUIDE_STEPS.length - 1) {
            closeGuide();
            return;
        }
        setStepIndex(Math.min(visibleStepIndex + 1, GUIDE_STEPS.length - 1));
    }, [closeGuide, hasActiveSegment, visibleStepIndex]);

    const previousStep = useCallback(() => {
        if (visibleStepIndex === 1) selectedDuringThisTourRef.current = false;
        setStepIndex(Math.max(visibleStepIndex - 1, 0));
    }, [visibleStepIndex]);

    useEffect(() => {
        if (status === 'loading' || !storageKey || autoOpenKeyRef.current === storageKey) return;
        autoOpenKeyRef.current = storageKey;

        try {
            if (window.localStorage.getItem(storageKey) === 'seen') return;
        } catch {
            return;
        }

        const timer = window.setTimeout(openGuide, 450);
        return () => window.clearTimeout(timer);
    }, [openGuide, status, storageKey]);

    const contextValue = useMemo<WorkspaceGuideContextValue>(() => ({ openGuide }), [openGuide]);

    return (
        <WorkspaceGuideContext.Provider value={contextValue}>
            {children}
            <WorkspaceGuideOverlay
                open={isOpen}
                stepIndex={visibleStepIndex}
                hasActiveSegment={hasActiveSegment}
                onBack={previousStep}
                onNext={nextStep}
                onClose={closeGuide}
            />
        </WorkspaceGuideContext.Provider>
    );
}

export function WorkspaceGuideTrigger() {
    const context = useContext(WorkspaceGuideContext);
    const t = useTranslations('IDE.workspaceGuide');

    if (!context) return null;

    return (
        <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 rounded-sm p-0 text-muted-foreground hover:text-foreground"
            onClick={context.openGuide}
            aria-label={t('trigger')}
            title={t('trigger')}
        >
            <Lightbulb className="size-4" aria-hidden="true" />
        </Button>
    );
}
