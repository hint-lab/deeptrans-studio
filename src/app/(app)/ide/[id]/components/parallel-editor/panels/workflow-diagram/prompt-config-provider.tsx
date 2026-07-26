'use client';

import {
    listWorkflowPromptSettingsAction,
    resetWorkflowPromptAction,
    saveWorkflowPromptAction,
} from '@/actions/workflow-prompts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { WORKFLOW_PROMPT_MAX_LENGTH, type WorkflowPromptKey } from '@/lib/workflow-prompt-keys';
import {
    canDismissPromptConfigSheet,
    getPromptConfigSheetState,
    isPromptConfigSettingsPayload,
    type PromptConfigLoadState,
    type PromptConfigSettingPayload,
} from './prompt-config-state';
import {
    AlertCircle,
    Check,
    FileCode2,
    Loader2,
    RefreshCw,
    RotateCcw,
    ShieldCheck,
    SlidersHorizontal,
    Sparkles,
} from 'lucide-react';
import { useLocale } from 'next-intl';
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { toast } from 'sonner';

export type WorkflowPromptSetting = PromptConfigSettingPayload;

type PromptContextValue = {
    openPrompt: (nodeKey: WorkflowPromptKey) => void;
    isCustomized: (nodeKey?: WorkflowPromptKey) => boolean;
};

const PromptConfigContext = createContext<PromptContextValue>({
    openPrompt: () => {},
    isCustomized: () => false,
});

export function usePromptConfig() {
    return useContext(PromptConfigContext);
}

export function WorkflowPromptProvider({ children }: { children: React.ReactNode }) {
    const locale = useLocale();
    const english = locale === 'en';
    const [settings, setSettings] = useState<WorkflowPromptSetting[]>([]);
    const [selectedKey, setSelectedKey] = useState<WorkflowPromptKey | null>(null);
    const [content, setContent] = useState('');
    const [enabled, setEnabled] = useState(true);
    const [loadState, setLoadState] = useState<PromptConfigLoadState>('loading');
    const [loadError, setLoadError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const loadRequestRef = useRef(0);

    const selected = useMemo(
        () => settings.find(item => item.nodeKey === selectedKey) || null,
        [selectedKey, settings]
    );

    const loadSettings = useCallback(async () => {
        const requestId = ++loadRequestRef.current;
        const fallbackMessage = english ? 'Could not load prompt settings' : '无法读取 Prompt 配置';
        setLoadState('loading');
        setLoadError(null);

        try {
            const result = await listWorkflowPromptSettingsAction(locale);
            if (requestId !== loadRequestRef.current) return;
            if (!isPromptConfigSettingsPayload(result)) {
                throw new Error(fallbackMessage);
            }
            setSettings(result);
            setLoadState('ready');
        } catch {
            if (requestId !== loadRequestRef.current) return;
            // The action can fail because of authentication, storage, or a
            // transient network issue. Do not render a backend error payload
            // as a personal-setting message; the recovery state is the same
            // and remains truthful without exposing internals.
            setLoadError(fallbackMessage);
            setLoadState('error');
            toast.error(fallbackMessage);
        }
    }, [english, locale]);

    useEffect(() => {
        void loadSettings();
        return () => {
            loadRequestRef.current += 1;
        };
    }, [loadSettings]);

    useEffect(() => {
        if (!selected) return;
        setContent(selected.content);
        setEnabled(selected.enabled);
    }, [selected]);

    const openPrompt = useCallback(
        (nodeKey: WorkflowPromptKey) => {
            if (saving) return;
            setSelectedKey(nodeKey);
        },
        [saving]
    );

    const close = useCallback(() => {
        if (!canDismissPromptConfigSheet(saving)) return;
        setSelectedKey(null);
    }, [saving]);

    const updateSetting = (nodeKey: WorkflowPromptKey, patch: Partial<WorkflowPromptSetting>) => {
        setSettings(current =>
            current.map(item => (item.nodeKey === nodeKey ? { ...item, ...patch } : item))
        );
    };

    const handleSave = async () => {
        if (!selected) return;
        try {
            setSaving(true);
            const result = await saveWorkflowPromptAction({
                nodeKey: selected.nodeKey,
                content,
                enabled,
            });
            updateSetting(selected.nodeKey, {
                ...result,
                updatedAt: new Date().toISOString(),
            });
            toast.success(english ? 'Personal prompt saved' : '个人 Prompt 已保存');
            // The write has succeeded; close explicitly rather than routing it
            // through the user-dismiss guard that blocks in-flight requests.
            setSelectedKey(null);
        } catch {
            toast.error(english ? 'Could not save prompt' : 'Prompt 保存失败');
        } finally {
            setSaving(false);
        }
    };

    const handleReset = async () => {
        if (!selected) return;
        try {
            setSaving(true);
            const result = await resetWorkflowPromptAction(selected.nodeKey);
            updateSetting(selected.nodeKey, { ...result, updatedAt: null });
            setContent('');
            setEnabled(true);
            toast.success(english ? 'Restored system default' : '已恢复系统默认');
        } catch {
            toast.error(english ? 'Could not reset prompt' : '恢复默认失败');
        } finally {
            setSaving(false);
        }
    };

    const value = useMemo<PromptContextValue>(
        () => ({
            openPrompt,
            isCustomized: nodeKey =>
                Boolean(nodeKey && settings.find(item => item.nodeKey === nodeKey)?.customized),
        }),
        [openPrompt, settings]
    );

    const hasUnsavedChanges = selected
        ? content !== selected.content || enabled !== selected.enabled
        : false;
    const sheetState = getPromptConfigSheetState({
        selectedKey,
        hasSelectedSetting: Boolean(selected),
        loadState,
    });

    return (
        <PromptConfigContext.Provider value={value}>
            {children}
            <Sheet open={Boolean(selectedKey)} onOpenChange={open => !open && close()}>
                <SheetContent className="overflow-hidden p-0">
                    {sheetState === 'loading' ? (
                        <div
                            className="flex h-full items-center justify-center text-sm text-muted-foreground"
                            role="status"
                            aria-live="polite"
                        >
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {english ? 'Loading prompt…' : '正在读取 Prompt…'}
                        </div>
                    ) : sheetState === 'error' ? (
                        <div
                            className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center"
                            role="alert"
                            aria-live="assertive"
                        >
                            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
                                <AlertCircle className="h-5 w-5" aria-hidden="true" />
                            </span>
                            <div className="space-y-1.5">
                                <h2 className="text-sm font-semibold text-foreground">
                                    {english
                                        ? 'Prompt settings could not be loaded'
                                        : '无法读取 Prompt 配置'}
                                </h2>
                                <p className="text-sm leading-6 text-muted-foreground">
                                    {loadError ||
                                        (english
                                            ? 'Check your connection, then reload this node configuration.'
                                            : '请检查连接后重新读取此节点的配置。')}
                                </p>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => void loadSettings()}
                            >
                                <RefreshCw className="h-4 w-4" />
                                {english ? 'Retry loading' : '重新读取'}
                            </Button>
                        </div>
                    ) : sheetState === 'missing' ? (
                        <div
                            className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center"
                            role="status"
                            aria-live="polite"
                        >
                            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                                <AlertCircle className="h-5 w-5" aria-hidden="true" />
                            </span>
                            <div className="space-y-1.5">
                                <h2 className="text-sm font-semibold text-foreground">
                                    {english
                                        ? 'This node configuration is unavailable'
                                        : '当前节点配置不可用'}
                                </h2>
                                <p className="text-sm leading-6 text-muted-foreground">
                                    {english
                                        ? 'Reload the configuration before editing this node prompt.'
                                        : '请重新读取配置后再编辑该节点的 Prompt。'}
                                </p>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => void loadSettings()}
                            >
                                <RefreshCw className="h-4 w-4" />
                                {english ? 'Reload configuration' : '重新读取配置'}
                            </Button>
                        </div>
                    ) : sheetState === 'no-selection' ? (
                        <div
                            className="flex h-full items-center justify-center px-8 text-center text-sm text-muted-foreground"
                            role="status"
                        >
                            {english
                                ? 'Select a workflow node to edit its prompt.'
                                : '请选择工作流节点以编辑 Prompt。'}
                        </div>
                    ) : sheetState === 'ready' && selected ? (
                        <>
                            <SheetHeader className="border-b bg-slate-50/80 px-6 py-5 pr-14 dark:bg-slate-950/40">
                                <div className="mb-2 flex items-center gap-2">
                                    <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-600 dark:border-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-300">
                                        <Sparkles className="h-4 w-4" />
                                    </span>
                                    <Badge
                                        variant="outline"
                                        className="border-indigo-200 bg-white text-[10px] font-medium text-indigo-700 dark:border-indigo-900 dark:bg-slate-950 dark:text-indigo-300"
                                    >
                                        {english ? 'Agent node' : '智能体节点'}
                                    </Badge>
                                    {selected.customized && (
                                        <Badge className="gap-1 bg-violet-600 text-[10px] hover:bg-violet-600">
                                            <Check className="h-3 w-3" />
                                            {english ? 'Customized' : '已自定义'}
                                        </Badge>
                                    )}
                                </div>
                                <SheetTitle>{selected.title}</SheetTitle>
                                <SheetDescription>{selected.description}</SheetDescription>
                            </SheetHeader>

                            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
                                <section className="space-y-3">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <div className="flex items-center gap-2 text-sm font-medium">
                                                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                                                {english
                                                    ? 'Protected system prompt'
                                                    : '系统 Prompt（受保护）'}
                                            </div>
                                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                                {english
                                                    ? 'Output contracts and runtime data stay read-only so the workflow remains stable.'
                                                    : '输出格式和运行数据保持只读，避免自定义内容破坏工作流。'}
                                            </p>
                                        </div>
                                        <FileCode2 className="mt-0.5 h-4 w-4 text-muted-foreground" />
                                    </div>
                                    <Textarea
                                        readOnly
                                        value={selected.systemPrompt}
                                        aria-label={
                                            english
                                                ? 'Protected system prompt'
                                                : '受保护的系统 Prompt'
                                        }
                                        className="min-h-40 resize-none border-slate-200 bg-slate-50 font-mono text-[11px] leading-5 text-slate-600 shadow-inner focus-visible:ring-0 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                                    />
                                </section>

                                <div className="relative flex items-center">
                                    <div className="h-px flex-1 bg-border" />
                                    <div className="mx-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                        <SlidersHorizontal className="h-3 w-3" />
                                        {english ? 'Personal layer' : '个人指令层'}
                                    </div>
                                    <div className="h-px flex-1 bg-border" />
                                </div>

                                <section className="space-y-3">
                                    <div className="flex items-center justify-between gap-4">
                                        <div>
                                            <div className="text-sm font-medium">
                                                {english
                                                    ? 'My additional instructions'
                                                    : '我的补充指令'}
                                            </div>
                                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                                {english
                                                    ? 'Applied only to your account and merged into this node at run time.'
                                                    : '仅对你的账号生效，运行该节点时自动合并。'}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-muted-foreground">
                                                {enabled
                                                    ? english
                                                        ? 'Enabled'
                                                        : '启用'
                                                    : english
                                                      ? 'Disabled'
                                                      : '停用'}
                                            </span>
                                            <Switch
                                                checked={enabled}
                                                onCheckedChange={setEnabled}
                                                disabled={saving}
                                                aria-label={
                                                    english
                                                        ? 'Enable personal prompt'
                                                        : '启用个人 Prompt'
                                                }
                                            />
                                        </div>
                                    </div>
                                    <Textarea
                                        value={content}
                                        onChange={event => setContent(event.target.value)}
                                        maxLength={WORKFLOW_PROMPT_MAX_LENGTH}
                                        disabled={saving || !enabled}
                                        placeholder={
                                            english
                                                ? 'Example: Preserve legal force and do not omit the responsible actor.'
                                                : '例如：保持法律规范力，不要省略义务主体；译文采用正式法律文体。'
                                        }
                                        aria-label={
                                            english ? 'My additional instructions' : '我的补充指令'
                                        }
                                        className="min-h-44 resize-y border-indigo-200/80 bg-indigo-50/30 leading-6 focus-visible:ring-indigo-500 dark:border-indigo-900 dark:bg-indigo-950/20"
                                    />
                                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                        <span>
                                            {english
                                                ? 'Takes effect on the next run; existing results are unchanged.'
                                                : '下次运行时生效，不会改写已有结果。'}
                                        </span>
                                        <span className="tabular-nums">
                                            {content.length}/{WORKFLOW_PROMPT_MAX_LENGTH}
                                        </span>
                                    </div>
                                </section>
                            </div>

                            <SheetFooter className="border-t bg-background px-6 py-4">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="mr-auto text-muted-foreground"
                                    onClick={handleReset}
                                    disabled={saving || !selected.customized}
                                >
                                    <RotateCcw className="h-4 w-4" />
                                    {english ? 'Restore default' : '恢复默认'}
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={close}
                                    disabled={saving}
                                >
                                    {english ? 'Cancel' : '取消'}
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={handleSave}
                                    disabled={saving || !hasUnsavedChanges || !content.trim()}
                                    className="bg-indigo-600 hover:bg-indigo-700"
                                >
                                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                                    {english ? 'Save changes' : '保存修改'}
                                </Button>
                            </SheetFooter>
                        </>
                    ) : null}
                </SheetContent>
            </Sheet>
        </PromptConfigContext.Provider>
    );
}
