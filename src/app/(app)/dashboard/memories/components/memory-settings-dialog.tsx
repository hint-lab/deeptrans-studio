'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { updateMemoryLanguagesAction } from '@/actions/memories';
import { LANGUAGES } from '@/constants/languages';
import {
    buildMemoryLanguageUpdateInput,
    hasMemoryLanguageUpdate,
    normalizeMemoryLanguagePair,
} from '@/lib/memory-language-settings';
import { useTranslations } from 'next-intl';

export function MemorySettingsDialog({
    open,
    onOpenChange,
    memoryId,
    sourceLanguage,
    targetLanguage,
    onUpdated,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    memoryId: string;
    sourceLanguage?: string | null;
    targetLanguage?: string | null;
    onUpdated?: () => void;
}) {
    const m = useTranslations('Dashboard.Memories.SettingsDialog');
    const common = useTranslations('Common');
    const langT = useTranslations('Common.languages');
    const [sourceLang, setSourceLang] = useState<string>('');
    const [targetLang, setTargetLang] = useState<string>('');
    const [saving, setSaving] = useState(false);
    const [formReady, setFormReady] = useState(false);

    const initialLanguagePair = useMemo(
        () =>
            normalizeMemoryLanguagePair({
                sourceLang: sourceLanguage,
                targetLang: targetLanguage,
            }),
        [sourceLanguage, targetLanguage]
    );

    const languages = LANGUAGES;

    useEffect(() => {
        setFormReady(false);
        if (!open) return;

        setSourceLang(initialLanguagePair.sourceLang);
        setTargetLang(initialLanguagePair.targetLang);
        setFormReady(true);
    }, [open, memoryId, initialLanguagePair.sourceLang, initialLanguagePair.targetLang]);

    const hasChanges = hasMemoryLanguageUpdate(initialLanguagePair, { sourceLang, targetLang });

    const handleSave = async () => {
        const input = buildMemoryLanguageUpdateInput(initialLanguagePair, {
            sourceLang,
            targetLang,
        });
        if (!Object.keys(input).length) return;

        try {
            setSaving(true);
            const res = await updateMemoryLanguagesAction(memoryId, input);
            if (!res.success) {
                toast.error(common('error'), { description: m('updateRetry') });
                return;
            }
            toast.success(m('updatedLanguagePair'));
            onUpdated?.();
            onOpenChange(false);
        } catch {
            toast.error(common('error'), { description: m('updateRetry') });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{m('title')}</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label>{m('sourceLanguage')}</Label>
                            <Select value={sourceLang} onValueChange={setSourceLang}>
                                <SelectTrigger className="h-9">
                                    <SelectValue placeholder={m('selectSourceLanguage')} />
                                </SelectTrigger>
                                <SelectContent>
                                    {languages.map(l => (
                                        <SelectItem key={l.key} value={l.key}>
                                            {langT(l.key)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>{m('targetLanguage')}</Label>
                            <Select value={targetLang} onValueChange={setTargetLang}>
                                <SelectTrigger className="h-9">
                                    <SelectValue placeholder={m('selectTargetLanguage')} />
                                </SelectTrigger>
                                <SelectContent>
                                    {languages.map(l => (
                                        <SelectItem key={l.key} value={l.key}>
                                            {langT(l.key)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        {common('cancel')}
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={saving || !memoryId || !formReady || !hasChanges}
                    >
                        {common('save')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
