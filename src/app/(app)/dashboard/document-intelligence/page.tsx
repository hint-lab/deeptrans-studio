'use client';
import { fetchDictionariesAction, fetchDictionaryEntriesAction } from '@/actions/dictionary';
import { parseDocxAction } from '@/actions/parse-docx';
import { runPreTranslateAction } from '@/actions/pre-translate';
import { FileUpload } from '@/components/file-upload';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
    BookOpen,
    FileText,
    Globe,
    Search,
    X
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export default function DocumentIntelligencePage() {
    const { data: session } = useSession();
    const tDashboard = useTranslations('Dashboard');
    const t = useTranslations('Dashboard.DocumentTranslate');
    // 在现有状态之后添加以下状态
    const [uploadedFile, setUploadedFile] = useState<{
        fileName: string;
        originalName: string;
        fileUrl: string;
        contentType: string;
        size: number;
    } | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [isTranslating, setIsTranslating] = useState(false);
    const [translationProgress, setTranslationProgress] = useState(0);
    const [translationResult, setTranslationResult] = useState<{
        content: string;
        sourceLanguage: string;
        targetLanguage: string;
        engine: string;
        fileName: string;
    } | null>(null);
    // 动态语言选项
    const sourceLanguages = [
        { key: 'auto', label: tDashboard('autoDetect') },
        { key: 'en', label: tDashboard('english') },
        { key: 'de', label: tDashboard('german') },
    ];
    const targetLanguages = [{ key: 'zh', label: tDashboard('chinese') }];
    // 公共参数
    const [tab, setTab] = useState('document');
    // 文档识别翻译参数
    const [taskStatus, setTaskStatus] = useState('idle');
    const [translatedContent, setTranslatedContent] = useState<string | null>(null);
    const [sourceLanguage, setSourceLanguage] = useState('auto');
    const [targetLanguage, setTargetLanguage] = useState('zh');
    const [translationEngine, setTranslationEngine] = useState('deepseek');
    const [preserveFormatting, setPreserveFormatting] = useState(true);
    const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
    const [selectedDictionaries, setSelectedDictionaries] = useState<string[]>([]);
    const [translationStyle, setTranslationStyle] = useState('formal');
    const [qualityLevel, setQualityLevel] = useState('standard');
    // 与即时翻译一致的词库状态
    interface DictionarySummary {
        id: string;
        name: string;
        description?: string | null;
        domain: string;
        isPublic: boolean;
        _count?: { entries: number };
    }
    interface DictionaryEntryItem {
        id: string;
        sourceText: string;
        targetText: string;
        notes?: string | null;
    }

    const [dictionaryDialogOpen, setDictionaryDialogOpen] = useState(false);
    const [publicDictionaries, setPublicDictionaries] = useState<DictionarySummary[]>([]);
    const [privateDictionaries, setPrivateDictionaries] = useState<DictionarySummary[]>([]);
    const [loadingDictionaries, setLoadingDictionaries] = useState(false);
    const [expandedDictionaryIds, setExpandedDictionaryIds] = useState<string[]>([]);
    const [dictionaryEntriesById, setDictionaryEntriesById] = useState<
        Record<string, DictionaryEntryItem[]>
    >({});
    const [loadingEntries, setLoadingEntries] = useState<Record<string, boolean>>({});
    const [dictionarySearch, setDictionarySearch] = useState('');
    const handleUploadComplete = (fileInfo: {
        fileName: string;
        originalName: string;
        fileUrl: string;
        contentType: string;
        size: number;
    }) => {
        setFileName(fileInfo.fileName);
        setTaskStatus('pending');
        setTranslatedContent(null);
        setTranslationResult(null);
        setUploadedFile(fileInfo);
        toast.success(t('uploadSuccess'));
    };
    const handleDownloadResult = () => {
        if (!translatedContent || !translationResult) return;

        const blob = new Blob([translatedContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `translated_${translationResult.fileName}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        toast.success(t('downloadSuccess'));
    };
    const handleTranslateDocument = async () => {
        if (!uploadedFile) {
            toast.error(t('noDocumentUploaded'));
            return;
        }

        if (!session?.user?.id) {
            toast.error(t('loginRequired'));
            return;
        }

        setIsTranslating(true);
        setTranslationProgress(0);
        setTaskStatus('processing');

        // 模拟进度更新（实际应用中可能来自WebSocket或轮询）
        const progressInterval = setInterval(() => {
            setTranslationProgress(prev => {
                if (prev >= 90) {
                    clearInterval(progressInterval);
                    return prev;
                }
                return prev + 10;
            });
        }, 500);

        try {
            const { success, data, error } = await parseDocxAction(uploadedFile.fileUrl);
            let content = '';
            let previewHtml: string | undefined;
            if (data) {
                content = String(data.text || '').trim();
            }
            // 构建翻译参数
            const translationParams = {
                sourceText: data?.text || '',
                sourceLanguage: sourceLanguage,
                targetLanguage: targetLanguage,
                options: {
                    userId: session.user.id
                }
            };
            // 调用翻译API
            const res = await runPreTranslateAction(translationParams.sourceText,
                translationParams.sourceLanguage,
                translationParams.targetLanguage,
                translationParams.options);
            const result = {
                success: true,
                data: {
                    translatedContent: res.translation,
                    sourceLanguage: translationParams.sourceLanguage,
                    targetLanguage: translationParams.targetLanguage,
                    engine: "deepseek",
                    fileName: uploadedFile.fileName,
                    // 可选的其他字段
                    wordCount: 1250,
                    timeUsed: 3.5
                }
            };
            clearInterval(progressInterval);
            setTranslationProgress(100);

            if (result.success && result.data) {
                setTranslatedContent(result.data.translatedContent);
                setTranslationResult({
                    content: result.data.translatedContent,
                    sourceLanguage: result.data.sourceLanguage || sourceLanguage,
                    targetLanguage: result.data.targetLanguage || targetLanguage,
                    engine: result.data.engine || translationEngine,
                    fileName: fileName || 'document',
                });
                setTaskStatus('completed');
                toast.success(t('translationSuccess'));
            } else {
                setTaskStatus('failed');
                //toast.error(result.error || t('translationFailed'));
            }
        } catch (error) {
            clearInterval(progressInterval);
            setTaskStatus('failed');
            console.error('Translation error:', error);
            toast.error(t('translationError'));
        } finally {
            setIsTranslating(false);
            setTimeout(() => setTranslationProgress(0), 1000);
        }
    };
    // 加载公共/私有词典（不加载词条）
    useEffect(() => {
        const loadDictionaries = async () => {
            setLoadingDictionaries(true);
            try {
                const [pubRes, privRes] = await Promise.all([
                    fetchDictionariesAction('public'),
                    session?.user?.id
                        ? fetchDictionariesAction('private', session.user.id)
                        : Promise.resolve({ success: true, data: [] as DictionarySummary[] }),
                ]);
                if (pubRes.success && pubRes.data) {
                    setPublicDictionaries(pubRes.data as unknown as DictionarySummary[]);
                }
                if (privRes.success && privRes.data) {
                    setPrivateDictionaries(privRes.data as unknown as DictionarySummary[]);
                } else if (!session?.user?.id) {
                    setPrivateDictionaries([]);
                }
            } catch (e) {
                console.error(t('loadDictionariesFailed'), e);
                toast.error(t('loadDictionariesFailed'));
            } finally {
                setLoadingDictionaries(false);
            }
        };
        void loadDictionaries();
    }, [session?.user?.id, toast]);

    // 展开并懒加载词条
    const onExpandDictionary = async (dictionaryId: string) => {
        setExpandedDictionaryIds(prev =>
            prev.includes(dictionaryId)
                ? prev.filter(id => id !== dictionaryId)
                : [...prev, dictionaryId]
        );
        if (!dictionaryEntriesById[dictionaryId]) {
            setLoadingEntries(prev => ({ ...prev, [dictionaryId]: true }));
            try {
                const res = await fetchDictionaryEntriesAction(dictionaryId);
                if (res.success && res.data) {
                    setDictionaryEntriesById(prev => ({
                        ...prev,
                        [dictionaryId]: (res.data as unknown as DictionaryEntryItem[]) ?? [],
                    }));
                }
            } catch (e) {
                console.error('加载词条失败', e);
                toast.error(t('loadEntriesFailed'));
            } finally {
                setLoadingEntries(prev => ({ ...prev, [dictionaryId]: false }));
            }
        }
    };

    // 使用/取消使用某词典
    const onToggleUseDictionary = (dictionaryId: string) => {
        setSelectedDictionaries(prev =>
            prev.includes(dictionaryId)
                ? prev.filter(id => id !== dictionaryId)
                : [...prev, dictionaryId]
        );
    };

    // 过滤词典
    const filteredPublic = publicDictionaries.filter(
        (dict: DictionarySummary) =>
            dict.name.toLowerCase().includes(dictionarySearch.toLowerCase()) ||
            dict.domain.toLowerCase().includes(dictionarySearch.toLowerCase())
    );
    const filteredPrivate = privateDictionaries.filter(
        (dict: DictionarySummary) =>
            dict.name.toLowerCase().includes(dictionarySearch.toLowerCase()) ||
            dict.domain.toLowerCase().includes(dictionarySearch.toLowerCase())
    );

    return (
        <div className="mx-auto w-full max-w-7xl p-6">
            <div className="mb-6">
                <h1 className="mb-2 text-3xl font-bold text-gray-900 dark:text-white">
                    {t('title')}
                </h1>
                <p className="text-gray-600 dark:text-gray-400">{t('description')}</p>
            </div>

            <div className="mb-6 flex items-center justify-between rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800">
                <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                        <Label className="text-sm font-medium">
                            {tDashboard('sourceLanguage')}
                        </Label>
                        <Select value={sourceLanguage} onValueChange={setSourceLanguage}>
                            <SelectTrigger className="w-32 border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800">
                                {sourceLanguages.map(lang => (
                                    <SelectItem
                                        key={lang.key}
                                        value={lang.key}
                                        className="text-gray-900 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-700"
                                    >
                                        {lang.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center space-x-2">
                        <Label className="text-sm font-medium">
                            {tDashboard('targetLanguage')}
                        </Label>
                        <Select value={targetLanguage} onValueChange={setTargetLanguage}>
                            <SelectTrigger className="w-32 border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800">
                                {targetLanguages.map(lang => (
                                    <SelectItem
                                        key={lang.key}
                                        value={lang.key}
                                        className="text-gray-900 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-700"
                                    >
                                        {lang.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                        <Switch
                            id="preserve-formatting"
                            checked={preserveFormatting}
                            onCheckedChange={setPreserveFormatting}
                        />
                        <Label htmlFor="preserve-formatting">{t('preserveFormatting')}</Label>
                    </div>

                    <Dialog open={dictionaryDialogOpen} onOpenChange={setDictionaryDialogOpen}>
                        <DialogTrigger asChild>
                            <Button variant="outline" className="flex items-center gap-2">
                                <Globe className="h-4 w-4" />
                                {t('dictionarySelection')}
                                <Badge variant="secondary" className="ml-1">
                                    {selectedDictionaries.length}
                                </Badge>
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-3xl">
                            <DialogHeader>
                                <DialogTitle>{t('dictionarySelection')}</DialogTitle>
                            </DialogHeader>
                            <div className="mt-2">
                                <div className="mb-3 flex items-center justify-between">
                                    <div className="text-sm text-gray-500">
                                        {t('selected')} {selectedDictionaries.length}{' '}
                                        {t('dictionaries')}
                                    </div>
                                    <div className="relative">
                                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                                        <input
                                            type="text"
                                            placeholder={t('searchDictionaries')}
                                            value={dictionarySearch}
                                            onChange={e => setDictionarySearch(e.target.value)}
                                            className="w-56 rounded-md border py-2 pl-8 pr-4 text-sm"
                                        />
                                    </div>
                                </div>
                                <ScrollArea className="h-80">
                                    <div className="space-y-4">
                                        <div>
                                            <div className="mb-2 text-sm font-semibold text-gray-600">
                                                {t('publicDictionaries')}
                                            </div>
                                            {loadingDictionaries && filteredPublic.length === 0 ? (
                                                <div className="text-sm text-gray-500">
                                                    {t('loading')}
                                                </div>
                                            ) : (
                                                <div className="space-y-3">
                                                    {filteredPublic.map(dictionary => (
                                                        <div
                                                            key={dictionary.id}
                                                            className={`rounded-lg border p-3 transition-colors ${expandedDictionaryIds.includes(dictionary.id) ? 'bg-gray-50 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                                                        >
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center space-x-3">
                                                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
                                                                        <FileText className="h-5 w-5 text-white" />
                                                                    </div>
                                                                    <div>
                                                                        <h4 className="font-medium">
                                                                            {dictionary.name}
                                                                        </h4>
                                                                        <p className="text-sm text-gray-500">
                                                                            {dictionary.domain}
                                                                        </p>
                                                                        <p className="text-xs text-gray-400">
                                                                            {dictionary.description ??
                                                                                ''}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center space-x-2">
                                                                    <Badge variant="outline">
                                                                        {dictionary._count
                                                                            ?.entries ?? 0}{' '}
                                                                        {t('entries')}
                                                                    </Badge>
                                                                    <Button
                                                                        size="sm"
                                                                        variant={
                                                                            selectedDictionaries.includes(
                                                                                dictionary.id
                                                                            )
                                                                                ? 'default'
                                                                                : 'outline'
                                                                        }
                                                                        onClick={() =>
                                                                            onToggleUseDictionary(
                                                                                dictionary.id
                                                                            )
                                                                        }
                                                                    >
                                                                        {selectedDictionaries.includes(
                                                                            dictionary.id
                                                                        )
                                                                            ? t('used')
                                                                            : t('use')}
                                                                    </Button>
                                                                    <Button
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        onClick={() =>
                                                                            onExpandDictionary(
                                                                                dictionary.id
                                                                            )
                                                                        }
                                                                    >
                                                                        {expandedDictionaryIds.includes(
                                                                            dictionary.id
                                                                        )
                                                                            ? t('collapse')
                                                                            : t('viewTerms')}
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                            {expandedDictionaryIds.includes(
                                                                dictionary.id
                                                            ) && (
                                                                    <div className="mt-3">
                                                                        {(loadingEntries[
                                                                            dictionary.id
                                                                        ] ?? false) ? (
                                                                            <div className="text-sm text-gray-500">
                                                                                {t('loadingTerms')}
                                                                            </div>
                                                                        ) : (
                                                                            <div className="max-h-40 space-y-2 overflow-auto pr-1">
                                                                                {(
                                                                                    dictionaryEntriesById[
                                                                                    dictionary.id
                                                                                    ] ?? []
                                                                                ).map(
                                                                                    (
                                                                                        entry: DictionaryEntryItem
                                                                                    ) => (
                                                                                        <div
                                                                                            key={
                                                                                                entry.id
                                                                                            }
                                                                                            className="text-sm text-gray-700 dark:text-gray-300"
                                                                                        >
                                                                                            <span className="font-medium">
                                                                                                {
                                                                                                    entry.sourceText
                                                                                                }
                                                                                            </span>
                                                                                            <span className="mx-2 text-gray-400">
                                                                                                →
                                                                                            </span>
                                                                                            <span>
                                                                                                {
                                                                                                    entry.targetText
                                                                                                }
                                                                                            </span>
                                                                                            {entry.notes ? (
                                                                                                <span className="ml-2 text-xs text-gray-400">
                                                                                                    (
                                                                                                    {
                                                                                                        entry.notes
                                                                                                    }
                                                                                                    )
                                                                                                </span>
                                                                                            ) : null}
                                                                                        </div>
                                                                                    )
                                                                                )}
                                                                                {!(
                                                                                    dictionaryEntriesById[
                                                                                    dictionary.id
                                                                                    ] ?? []
                                                                                ).length && (
                                                                                        <div className="text-sm text-gray-500">
                                                                                            {t('noTerms')}
                                                                                        </div>
                                                                                    )}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <Separator />

                                        <div>
                                            <div className="mb-2 text-sm font-semibold text-gray-600">
                                                {t('privateDictionaries')}
                                            </div>
                                            {loadingDictionaries && filteredPrivate.length === 0 ? (
                                                <div className="text-sm text-gray-500">
                                                    {t('loading')}
                                                </div>
                                            ) : (
                                                <div className="space-y-3">
                                                    {filteredPrivate.map(dictionary => (
                                                        <div
                                                            key={dictionary.id}
                                                            className={`rounded-lg border p-3 transition-colors ${expandedDictionaryIds.includes(dictionary.id) ? 'bg-gray-50 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                                                        >
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center space-x-3">
                                                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-green-500 to-teal-600">
                                                                        <FileText className="h-5 w-5 text-white" />
                                                                    </div>
                                                                    <div>
                                                                        <h4 className="font-medium">
                                                                            {dictionary.name}
                                                                        </h4>
                                                                        <p className="text-sm text-gray-500">
                                                                            {dictionary.domain}
                                                                        </p>
                                                                        <p className="text-xs text-gray-400">
                                                                            {dictionary.description ??
                                                                                ''}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center space-x-2">
                                                                    <Badge variant="outline">
                                                                        {dictionary._count
                                                                            ?.entries ?? 0}{' '}
                                                                        {t('entries')}
                                                                    </Badge>
                                                                    <Button
                                                                        size="sm"
                                                                        variant={
                                                                            selectedDictionaries.includes(
                                                                                dictionary.id
                                                                            )
                                                                                ? 'default'
                                                                                : 'outline'
                                                                        }
                                                                        onClick={() =>
                                                                            onToggleUseDictionary(
                                                                                dictionary.id
                                                                            )
                                                                        }
                                                                    >
                                                                        {selectedDictionaries.includes(
                                                                            dictionary.id
                                                                        )
                                                                            ? t('used')
                                                                            : t('use')}
                                                                    </Button>
                                                                    <Button
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        onClick={() =>
                                                                            onExpandDictionary(
                                                                                dictionary.id
                                                                            )
                                                                        }
                                                                    >
                                                                        {expandedDictionaryIds.includes(
                                                                            dictionary.id
                                                                        )
                                                                            ? t('collapse')
                                                                            : t('viewTerms')}
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                            {expandedDictionaryIds.includes(
                                                                dictionary.id
                                                            ) && (
                                                                    <div className="mt-3">
                                                                        {(loadingEntries[
                                                                            dictionary.id
                                                                        ] ?? false) ? (
                                                                            <div className="text-sm text-gray-500">
                                                                                {t('loadingTerms')}
                                                                            </div>
                                                                        ) : (
                                                                            <div className="max-h-40 space-y-2 overflow-auto pr-1">
                                                                                {(
                                                                                    dictionaryEntriesById[
                                                                                    dictionary.id
                                                                                    ] ?? []
                                                                                ).map(
                                                                                    (
                                                                                        entry: DictionaryEntryItem
                                                                                    ) => (
                                                                                        <div
                                                                                            key={
                                                                                                entry.id
                                                                                            }
                                                                                            className="text-sm text-gray-700 dark:text-gray-300"
                                                                                        >
                                                                                            <span className="font-medium">
                                                                                                {
                                                                                                    entry.sourceText
                                                                                                }
                                                                                            </span>
                                                                                            <span className="mx-2 text-gray-400">
                                                                                                →
                                                                                            </span>
                                                                                            <span>
                                                                                                {
                                                                                                    entry.targetText
                                                                                                }
                                                                                            </span>
                                                                                            {entry.notes ? (
                                                                                                <span className="ml-2 text-xs text-gray-400">
                                                                                                    (
                                                                                                    {
                                                                                                        entry.notes
                                                                                                    }
                                                                                                    )
                                                                                                </span>
                                                                                            ) : null}
                                                                                        </div>
                                                                                    )
                                                                                )}
                                                                                {!(
                                                                                    dictionaryEntriesById[
                                                                                    dictionary.id
                                                                                    ] ?? []
                                                                                ).length && (
                                                                                        <div className="text-sm text-gray-500">
                                                                                            {t('noTerms')}
                                                                                        </div>
                                                                                    )}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </ScrollArea>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <div className="space-y-6">
                <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                        <div className="text-lg font-medium">{t('documentUpload')}</div>
                    </div>
                    <div className="p-4">
                        <div className="mb-3 w-full">
                            <FileUpload
                                onUploadComplete={handleUploadComplete}
                                projectName={t('temporaryDocument')}
                                elementName="Dashboard.DocumentTranslate"
                            />
                            {uploadedFile && (
                                <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center space-x-3">
                                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-800">
                                                <FileText className="h-5 w-5 text-green-600 dark:text-green-300" />
                                            </div>
                                            <div>
                                                <h4 className="font-medium text-green-800 dark:text-green-300">
                                                    {fileName}
                                                </h4>
                                                <p className="text-sm text-green-600 dark:text-green-400">
                                                    {t('readyForTranslation')}
                                                </p>
                                            </div>
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                setUploadedFile(null);
                                                setFileName(null);
                                                setTaskStatus('idle');
                                            }}
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="mt-2 text-sm text-purple-600">
                            {t('supportedFileTypes')}
                        </div>
                    </div>
                </div>

                {showAdvancedOptions && (
                    <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                        <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                            <div className="flex items-center justify-between">
                                <div className="text-lg font-medium">{t('advancedOptions')}</div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowAdvancedOptions(false)}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                        <div className="p-4">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                                <div className="space-y-2">
                                    <Label className="text-sm font-medium">
                                        {t('translationEngine')}
                                    </Label>
                                    <Select value={translationEngine} onValueChange={setTranslationEngine}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-sm font-medium">
                                        {t('translationStyle')}
                                    </Label>
                                    <Select value={translationStyle} onValueChange={setTranslationStyle}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="formal">
                                                {tDashboard('formal')}
                                            </SelectItem>
                                            <SelectItem value="casual">
                                                {tDashboard('casual')}
                                            </SelectItem>
                                            <SelectItem value="technical">
                                                {tDashboard('technical')}
                                            </SelectItem>
                                            <SelectItem value="creative">
                                                {tDashboard('creative')}
                                            </SelectItem>
                                            <SelectItem value="academic">
                                                {tDashboard('academic')}
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-sm font-medium">
                                        {t('qualityLevel')}
                                    </Label>
                                    <Select value={qualityLevel} onValueChange={setQualityLevel}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="fast">{t('fast')}</SelectItem>
                                            <SelectItem value="standard">
                                                {t('standard')}
                                            </SelectItem>
                                            <SelectItem value="high">{t('high')}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                        <div className="text-lg font-medium">{t('translate')}</div>
                    </div>
                    <div className="p-4">
                        <div className="flex items-center space-x-4">
                            <Button
                                className="w-40"
                                onClick={handleTranslateDocument}
                                disabled={!uploadedFile || isTranslating || taskStatus === 'processing'}
                            >
                                {isTranslating ? (
                                    <>
                                        <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                        {t('translating')} {translationProgress}%
                                    </>
                                ) : (
                                    t('startTranslation')
                                )}
                            </Button>

                            {taskStatus === 'processing' && (
                                <div className="flex-1">
                                    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                                        <div
                                            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all duration-300"
                                            style={{ width: `${translationProgress}%` }}
                                        />
                                    </div>
                                </div>
                            )}
                            {taskStatus === 'failed' && (
                                <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
                                    <div className="flex items-center">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-800">
                                            <X className="h-5 w-5 text-red-600 dark:text-red-300" />
                                        </div>
                                        <div className="ml-4">
                                            <h4 className="font-medium text-red-800 dark:text-red-300">
                                                {t('translationFailed')}
                                            </h4>
                                            <p className="text-sm text-red-600 dark:text-red-400">
                                                {t('pleaseTryAgain')}
                                            </p>
                                        </div>
                                        <Button
                                            className="ml-auto"
                                            variant="outline"
                                            size="sm"
                                            onClick={handleTranslateDocument}
                                        >
                                            {t('retry')}
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {translatedContent && translationResult && (
                            <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-800">
                                <div className="mb-4 flex items-center justify-between">
                                    <div>
                                        <div className="text-lg font-semibold">
                                            {t('translationResult')}
                                        </div>
                                        <div className="text-sm text-gray-500 dark:text-gray-400">
                                            {t('sourceLanguage')}: {translationResult.sourceLanguage} →
                                            {t('targetLanguage')}: {translationResult.targetLanguage}
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <Badge variant="outline">
                                            {translationResult.fileName}
                                        </Badge>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                // 复制到剪贴板
                                                navigator.clipboard.writeText(translatedContent);
                                                toast.success(t('copiedToClipboard'));
                                            }}
                                        >
                                            {t('copy')}
                                        </Button>
                                    </div>
                                </div>

                                <ScrollArea className="h-96 rounded-md border p-4">
                                    <div className="whitespace-pre-wrap text-sm leading-relaxed">
                                        {translatedContent}
                                    </div>
                                </ScrollArea>

                                <div className="mt-4 flex space-x-3">
                                    <Button
                                        onClick={handleDownloadResult}
                                        className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
                                    >
                                        <FileText className="mr-2 h-4 w-4" />
                                        {t('downloadResult')}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            // 保存到我的翻译
                                            //handleSaveTranslation();
                                        }}
                                    >
                                        <BookOpen className="mr-2 h-4 w-4" />
                                        {t('saveToMyTranslations')}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
