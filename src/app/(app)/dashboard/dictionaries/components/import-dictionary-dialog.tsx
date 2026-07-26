'use client';

import { createDictionaryFromImportAction } from '@/actions/dictionary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Building2,
    CheckCircle2,
    Coffee,
    Eye,
    FileCode2,
    FileSpreadsheet,
    FileText,
    Loader2,
    Settings,
    Upload,
    User,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DictionaryTemplateDownloadButton } from './dictionary-import-guide';
type DictLite = { id: string; name: string };

export function ImportDictionaryDialog({
    dictionaries,
    onImported,
    modeContext,
}: {
    dictionaries?: DictLite[];
    onImported?: () => void;
    modeContext: 'private' | 'project';
}) {
    const [open, setOpen] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string[]>([]);
    const [parsedEntries, setParsedEntries] = useState<
        Array<{ sourceText: string; targetText: string; notes?: string }>
    >([]);
    const [loading, setLoading] = useState(false);
    const t = useTranslations('Dashboard.Dictionaries');
    // 字段映射（Excel）
    const [sourceKey, setSourceKey] = useState('source');
    const [targetKey, setTargetKey] = useState('target');
    const [notesKey, setNotesKey] = useState('notes');
    const isExcel = useMemo(() => file && /\.(xlsx|xls|csv)$/i.test(file.name), [file]);
    const isTbx = useMemo(() => file && /\.(tbx|xml)$/i.test(file.name), [file]);

    // 启用预览功能
    const enablePreview = true;

    // `PROJECT` is the persisted visibility value, but this global dashboard
    // surface represents a tenant/team-shared dictionary rather than a binding
    // to one selected project.
    const isTeamShared = modeContext === 'project';

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0] || null;
        setFile(f);
        setPreview([]);
        setParsedEntries([]);
    };

    useEffect(() => {
        if (!file || !enablePreview) return;
        let active = true;
        setPreview([]);
        setParsedEntries([]);

        const parsePreview = async () => {
            try {
                const ext = file.name.toLowerCase().split('.').pop();
                if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
                    const XLSX = await import('xlsx');
                    const buf = await file.arrayBuffer();
                    const wb = XLSX.read(buf, { type: 'array' });
                    const firstSheetName = wb.SheetNames?.[0] ?? '';
                    const ws = firstSheetName ? wb.Sheets[firstSheetName] : undefined;
                    const rows: any[] = ws ? XLSX.utils.sheet_to_json(ws, { defval: '' }) : [];

                    const previewRows = rows.slice(0, 10).map((r, idx) => {
                        const keys = Object.keys(r).slice(0, 5);
                        const rowPreview = keys
                            .map(k => `${k}: ${String(r[k]).slice(0, 30)}`)
                            .join(' | ');
                        return `行${idx + 1}: ${rowPreview}`;
                    });

                    const norm = (key: string) =>
                        String(key || '')
                            .trim()
                            .toLowerCase();
                    const entries = rows
                        .map(row => {
                            const normalizedRow: Record<string, unknown> = {};
                            for (const key of Object.keys(row)) {
                                normalizedRow[norm(key)] = row[key];
                            }
                            return {
                                sourceText: String(
                                    normalizedRow[norm(sourceKey)] ??
                                        normalizedRow['源'] ??
                                        normalizedRow.source ??
                                        ''
                                ).trim(),
                                targetText: String(
                                    normalizedRow[norm(targetKey)] ??
                                        normalizedRow['译'] ??
                                        normalizedRow.target ??
                                        ''
                                ).trim(),
                                notes: String(
                                    normalizedRow[norm(notesKey)] ??
                                        normalizedRow['备注'] ??
                                        normalizedRow.notes ??
                                        ''
                                ).trim(),
                            };
                        })
                        .filter(entry => entry.sourceText && entry.targetText);

                    if (active) {
                        setPreview(previewRows);
                        setParsedEntries(entries);
                    }
                } else if (ext === 'tbx' || ext === 'xml') {
                    const text = await file.text();
                    const lines = text.split(/\r?\n/).slice(0, 10);
                    if (active) {
                        setPreview(lines.map((line, idx) => `行${idx + 1}: ${line.slice(0, 100)}`));
                        setParsedEntries([]);
                    }
                } else if (active) {
                    setPreview([t('unsupportedImportFile')]);
                    setParsedEntries([]);
                }
            } catch {
                if (active) {
                    setPreview([t('importPreviewFailed')]);
                    setParsedEntries([]);
                }
            }
        };

        void parsePreview();
        return () => {
            active = false;
        };
    }, [file, sourceKey, targetKey, notesKey]);

    const handleImport = async () => {
        if (!file) {
            toast.error(t('pleaseSelectFile'));
            return;
        }
        if (isExcel && parsedEntries.length === 0) {
            toast.error(t('Guide.noValidEntries'));
            return;
        }
        try {
            setLoading(true);

            const baseName =
                file.name.replace(/\.[^.]+$/, '') ||
                t(isTeamShared ? 'teamSharedFallbackName' : 'privateFallbackName');
            const importRes = await createDictionaryFromImportAction({
                name: baseName,
                description: t(
                    isTeamShared ? 'importTeamSharedDescription' : 'importPrivateDescription'
                ),
                domain: 'general',
                visibility: isTeamShared ? 'PROJECT' : 'PRIVATE',
                file,
                sourceLang: 'auto',
                targetLang: 'auto',
                sourceKey,
                targetKey,
                notesKey,
            });
            if (!importRes?.success) {
                toast.error(t('importFailed'), {
                    description: importRes?.error || undefined,
                });
                return;
            }
            toast.success(
                t('importSuccess', { name: baseName, count: importRes?.data?.total ?? 0 })
            );
            onImported?.();
            setOpen(false);
        } catch {
            toast.error(t('importFailed'));
        } finally {
            setLoading(false);
        }
    };

    const getFileTypeIcon = () => {
        if (!file) return <FileText className="h-4 w-4" />;
        if (isExcel)
            return <FileSpreadsheet aria-hidden="true" className="h-4 w-4 text-green-600" />;
        if (isTbx) return <FileCode2 aria-hidden="true" className="h-4 w-4 text-blue-600" />;
        return <FileText className="h-4 w-4" />;
    };

    return (
        <>
            <Button variant="outline" onClick={() => setOpen(true)}>
                <Upload className="mr-2 h-4 w-4" />
                {isTeamShared ? t('importTeamSharedDictionary') : t('importPrivateDictionary')}
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col">
                    <DialogHeader className="flex-shrink-0">
                        <DialogTitle className="flex items-center gap-2">
                            {isTeamShared ? (
                                <Building2 className="h-5 w-5 text-blue-600" />
                            ) : (
                                <User className="h-5 w-5 text-purple-600" />
                            )}
                            {t('importAIEnhancedDictionary')}
                        </DialogTitle>
                        <DialogDescription>
                            {t(
                                isTeamShared
                                    ? 'importTeamSharedDescription'
                                    : 'importPrivateDescription'
                            )}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 space-y-4 overflow-auto">
                        {/* 加载状态 */}
                        {loading && (
                            <Card className="border-amber-200 bg-amber-50">
                                <CardContent className="flex items-center gap-3 py-4">
                                    <Coffee className="h-5 w-5 text-amber-600" />
                                    <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                                    <span className="text-amber-800">{t('importLoading')}</span>
                                </CardContent>
                            </Card>
                        )}
                        {/* 文件选择区域 */}
                        <Card className="border-blue-200 bg-blue-50/30">
                            <CardHeader className="pb-3">
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Settings className="h-4 w-4" />
                                    {t(
                                        isTeamShared
                                            ? 'teamSharedDictionaryConfig'
                                            : 'privateDictionaryConfig'
                                    )}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex flex-col gap-3 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 dark:border-emerald-900 dark:bg-emerald-950/30 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <p className="text-sm font-medium">
                                            {t('Guide.dialogTitle')}
                                        </p>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            {t('Guide.dialogDescription')}
                                        </p>
                                    </div>
                                    <DictionaryTemplateDownloadButton
                                        compact
                                        className="shrink-0"
                                    />
                                </div>
                                <div>
                                    <Label className="text-sm font-medium">选择文件</Label>
                                    <div className="relative">
                                        <Input
                                            type="file"
                                            accept=".xlsx,.xls,.csv,.tbx,.xml"
                                            onChange={handleFileChange}
                                            className="h-9"
                                            disabled={loading}
                                        />
                                        {file && (
                                            <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-2">
                                                {getFileTypeIcon()}
                                                <Badge variant="secondary" className="text-xs">
                                                    {file.name.split('.').pop()?.toUpperCase()}
                                                </Badge>
                                            </div>
                                        )}
                                    </div>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        支持 Excel (.xlsx/.xls/.csv) 和 TBX (.tbx/.xml) 格式
                                    </p>
                                </div>

                                {isTeamShared && (
                                    <div className="rounded-lg bg-blue-100 p-3 text-sm">
                                        <div className="flex items-start gap-2">
                                            <Building2 className="mt-0.5 h-4 w-4 text-blue-600" />
                                            <div>
                                                <p className="font-medium text-blue-800">
                                                    {t('teamSharedDictionaryFeatures')}
                                                </p>
                                                <ul className="mt-1 space-y-1 text-xs text-blue-700">
                                                    <li>{t('teamSharedFeatureSemanticSearch')}</li>
                                                    <li>{t('teamSharedFeatureFuzzyMatching')}</li>
                                                    <li>{t('teamSharedFeatureCloudStorage')}</li>
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Excel 字段映射 */}
                        {isExcel && (
                            <Card>
                                <CardHeader className="pb-3">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <Settings className="h-4 w-4" />
                                        字段映射设置
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <Label className="text-sm">源文列名</Label>
                                            <Input
                                                value={sourceKey}
                                                onChange={e => setSourceKey(e.target.value)}
                                                className="h-8"
                                                placeholder="source"
                                                disabled={loading}
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-sm">译文列名</Label>
                                            <Input
                                                value={targetKey}
                                                onChange={e => setTargetKey(e.target.value)}
                                                className="h-8"
                                                placeholder="target"
                                                disabled={loading}
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-sm">备注列名</Label>
                                            <Input
                                                value={notesKey}
                                                onChange={e => setNotesKey(e.target.value)}
                                                className="h-8"
                                                placeholder="notes"
                                                disabled={loading}
                                            />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {/* 文件预览 */}
                        {file && (
                            <Card>
                                <CardHeader className="pb-3">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <Eye className="h-4 w-4" />
                                        文件预览
                                        {parsedEntries.length > 0 && (
                                            <Badge variant="outline" className="ml-2">
                                                {parsedEntries.length} 条有效数据
                                            </Badge>
                                        )}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="max-h-48 overflow-auto rounded-lg bg-slate-50 p-4">
                                        {preview.length > 0 ? (
                                            <div className="space-y-1 font-mono text-xs">
                                                {preview.map((line, idx) => (
                                                    <div
                                                        key={idx}
                                                        className="leading-relaxed text-slate-700"
                                                    >
                                                        {line}
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="py-4 text-center text-sm text-slate-500">
                                                选择文件后将显示预览内容
                                            </div>
                                        )}
                                    </div>
                                    {parsedEntries.length > 0 && (
                                        <div className="mt-3 flex items-center gap-2 text-sm text-green-600">
                                            <CheckCircle2 className="h-4 w-4" />
                                            解析成功，预计导入 {parsedEntries.length} 条词条
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex flex-shrink-0 items-center justify-between border-t pt-4">
                        <div className="text-sm text-muted-foreground">
                            {file ? `已选择: ${file.name}` : '请选择要导入的词库文件'}
                        </div>
                        <div className="flex gap-3">
                            <Button
                                variant="outline"
                                onClick={() => setOpen(false)}
                                disabled={loading}
                            >
                                取消
                            </Button>
                            <Button
                                onClick={handleImport}
                                disabled={
                                    loading || !file || (!!isExcel && parsedEntries.length === 0)
                                }
                                className="min-w-[120px] bg-blue-600 hover:bg-blue-700"
                            >
                                {loading ? (
                                    <span className="inline-flex items-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        上传中…
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-2">
                                        {isTeamShared ? (
                                            <Building2 className="h-4 w-4" />
                                        ) : (
                                            <User className="h-4 w-4" />
                                        )}
                                        {isTeamShared
                                            ? t('importTeamSharedDictionary')
                                            : t('importPrivateDictionary')}
                                    </span>
                                )}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

export default ImportDictionaryDialog;
