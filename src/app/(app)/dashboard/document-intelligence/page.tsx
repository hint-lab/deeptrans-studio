'use client';
import { fetchDictionariesAction, fetchDictionaryEntriesAction } from '@/actions/dictionary';
import { parseDocxAction } from '@/actions/parse-docx';
import { embedAndTranslateAction } from '@/actions/pre-translate';
import { DOCX_ACCEPTED_FILE_TYPES, FileUpload } from '@/components/file-upload';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MediaTranslationWorkspace } from '../components/media-translation-workspace';
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
import { createLogger } from '@/lib/logger';
import {
    requireSelectedDictionaryEntries,
    SelectedDictionaryEntriesLoadError,
} from '@/lib/selected-dictionary-entries';
import type { DictEntry } from '@/types/terms';
import {
    FileText,
    Globe,
    Search,
    X
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
const logger = createLogger({
    type: 'document-intelligence:page',
}, {
    json: false,// 开启json格式输出
    pretty: false, // 关闭开发环境美化输出
    colors: true, // 仅当json：false时启用颜色输出可用
    includeCaller: false, // 日志不包含调用者
});
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
    const [fileUploadResetKey, setFileUploadResetKey] = useState(0);
    const translationRequestRef = useRef(0);
    const activeTranslationRequestRef = useRef<number | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [isTranslating, setIsTranslating] = useState(false);
    const [translationResult, setTranslationResult] = useState<{
        content: string;
        sourceLanguage: string;
        targetLanguage: string;
        fileName: string;
    } | null>(null);
    // 动态语言选项
    const sourceLanguages = [
        { key: 'auto', label: tDashboard('autoDetect') },
        { key: 'en', label: tDashboard('english') },
        { key: 'de', label: tDashboard('german') },
    ];
    const targetLanguages = [{ key: 'zh', label: tDashboard('chinese') }];
    const translationStyles = [
        { key: 'formal', label: tDashboard('formal') },
        { key: 'casual', label: tDashboard('casual') },
        { key: 'technical', label: tDashboard('technical') },
        { key: 'creative', label: tDashboard('creative') },
        { key: 'academic', label: tDashboard('academic') },
    ];
    // 文档识别翻译参数
    const [taskStatus, setTaskStatus] = useState('idle');
    const [translatedContent, setTranslatedContent] = useState<string | null>(null);
    const [sourceLanguage, setSourceLanguage] = useState('auto');
    const [targetLanguage, setTargetLanguage] = useState('zh');
    const [selectedDictionaries, setSelectedDictionaries] = useState<string[]>([]);
    const [translationStyle, setTranslationStyle] = useState('formal');
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
    const invalidateTranslation = (nextStatus: 'idle' | 'pending' = uploadedFile ? 'pending' : 'idle') => {
        translationRequestRef.current += 1;
        activeTranslationRequestRef.current = null;
        setIsTranslating(false);
        setTaskStatus(nextStatus);
        setTranslatedContent(null);
        setTranslationResult(null);
    };
    const handleUploadComplete = (fileInfo: {
        fileName: string;
        originalName: string;
        fileUrl: string;
        contentType: string;
        size: number;
    }) => {
        translationRequestRef.current += 1;
        activeTranslationRequestRef.current = null;
        setFileName(fileInfo.fileName);
        setIsTranslating(false);
        setTaskStatus('pending');
        setTranslatedContent(null);
        setTranslationResult(null);
        setUploadedFile(fileInfo);
        toast.success(t('uploadSuccess'));
    };
    const clearCurrentUpload = () => {
        translationRequestRef.current += 1;
        activeTranslationRequestRef.current = null;
        setIsTranslating(false);
        setUploadedFile(null);
        setFileName(null);
        setTaskStatus('idle');
        setTranslatedContent(null);
        setTranslationResult(null);
    };
    const handleSourceLanguageChange = (value: string) => {
        if (value === sourceLanguage) return;
        invalidateTranslation();
        setSourceLanguage(value);
    };
    const handleTargetLanguageChange = (value: string) => {
        if (value === targetLanguage) return;
        invalidateTranslation();
        setTargetLanguage(value);
    };
    const getSelectedDictionaryEntries = async (): Promise<DictEntry[]> => {
        if (selectedDictionaries.length === 0) return [];

        const allEntries: DictEntry[] = [];
        for (const dictionaryId of selectedDictionaries) {
            try {
                const result = await fetchDictionaryEntriesAction(dictionaryId);
                const entries = requireSelectedDictionaryEntries<DictionaryEntryItem>(result);
                allEntries.push(
                    ...entries.map(entry => ({
                        term: entry.sourceText,
                        translation: entry.targetText,
                        notes: entry.notes || undefined,
                    }))
                );
            } catch (error) {
                logger.error('获取已选词库词条失败:', error);
                if (error instanceof SelectedDictionaryEntriesLoadError) throw error;
                throw new SelectedDictionaryEntriesLoadError();
            }
        }

        return allEntries;
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
        const fileToTranslate = uploadedFile;
        if (!fileToTranslate) {
            toast.error(t('noDocumentUploaded'));
            return;
        }
        if (activeTranslationRequestRef.current !== null) return;

        const requestId = ++translationRequestRef.current;
        activeTranslationRequestRef.current = requestId;
        const sourceLanguageAtStart = sourceLanguage;
        const targetLanguageAtStart = targetLanguage;
        const translationStyleAtStart = translationStyle;
        setIsTranslating(true);
        setTaskStatus('processing');
        setTranslatedContent(null);
        setTranslationResult(null);

        try {
            const { success, data, error } = await parseDocxAction(fileToTranslate.fileName);
            if (!success) {
                throw new Error(error || t('translationFailed'));
            }
            if (requestId !== translationRequestRef.current) return;
            let content = '';
            if (data) {
                content = String(data.text || '').trim();
            }
            if (!content) {
                throw new Error(t('ocrEmpty'));
            }
            const dictionaryEntries = await getSelectedDictionaryEntries();
            const translatedContent = String(
                await embedAndTranslateAction(
                    content,
                    sourceLanguageAtStart,
                    targetLanguageAtStart,
                    dictionaryEntries,
                    { style: translationStyleAtStart }
                )
            ).trim();
            if (requestId !== translationRequestRef.current) return;
            if (!translatedContent) {
                throw new Error(t('translationFailed'));
            }
            setTranslatedContent(translatedContent);
            setTranslationResult({
                content: translatedContent,
                sourceLanguage: sourceLanguageAtStart,
                targetLanguage: targetLanguageAtStart,
                fileName: fileToTranslate.fileName || 'document',
            });
            setTaskStatus('completed');
            toast.success(t('translationSuccess'));
        } catch (error) {
            if (requestId !== translationRequestRef.current) return;
            setTaskStatus('failed');
            logger.error('Translation error:', error);
            toast.error(
                error instanceof SelectedDictionaryEntriesLoadError
                    ? t('loadEntriesFailed')
                    : t('translationError')
            );
        } finally {
            if (requestId === translationRequestRef.current) {
                activeTranslationRequestRef.current = null;
                setIsTranslating(false);
            }
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
                        ? fetchDictionariesAction('private')
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
                logger.error(t('loadDictionariesFailed'), e);
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
                logger.error('加载词条失败', e);
                toast.error(t('loadEntriesFailed'));
            } finally {
                setLoadingEntries(prev => ({ ...prev, [dictionaryId]: false }));
            }
        }
    };

    // 使用/取消使用某词典
    const onToggleUseDictionary = (dictionaryId: string) => {
        invalidateTranslation();
        setSelectedDictionaries(prev =>
            prev.includes(dictionaryId)
                ? prev.filter(id => id !== dictionaryId)
                : [...prev, dictionaryId]
        );
    };
    const handleTranslationStyleChange = (value: string) => {
        if (value === translationStyle) return;
        invalidateTranslation();
        setTranslationStyle(value);
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

            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800">
                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center space-x-2">
                        <Label className="text-sm font-medium">
                            {tDashboard('sourceLanguage')}
                        </Label>
                        <Select value={sourceLanguage} onValueChange={handleSourceLanguageChange}>
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
                        <Select value={targetLanguage} onValueChange={handleTargetLanguageChange}>
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

                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                        <Label className="text-sm font-medium">{t('translationStyle')}</Label>
                        <Select value={translationStyle} onValueChange={handleTranslationStyleChange}>
                            <SelectTrigger className="w-32">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {translationStyles.map(style => (
                                    <SelectItem key={style.key} value={style.key}>
                                        {style.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
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
            <p className="-mt-3 mb-6 text-xs text-gray-500 dark:text-gray-400">
                {t('plainTextOutputNote')}
            </p>

            <div className="space-y-6">
                <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                        <div className="text-lg font-medium">{t('documentUpload')}</div>
                    </div>
                    <div className="p-4">
                        <div className="mb-3 w-full">
                            <FileUpload
                                onUploadComplete={handleUploadComplete}
                                onUploadReset={clearCurrentUpload}
                                resetKey={fileUploadResetKey}
                                projectName={t('temporaryDocument')}
                                elementName="Dashboard.DocumentTranslate"
                                acceptedFileTypes={DOCX_ACCEPTED_FILE_TYPES}
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
                                                clearCurrentUpload();
                                                setFileUploadResetKey(value => value + 1);
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

                <MediaTranslationWorkspace
                    labels={{
                        translate: t('translate'),
                        translating: t('translating'),
                        startTranslation: t('startTranslation'),
                        retry: t('retry'),
                        translationResult: t('translationResult'),
                        sourceLanguage: t('sourceLanguage'),
                        targetLanguage: t('targetLanguage'),
                        copy: t('copy'),
                        copiedToClipboard: t('copiedToClipboard'),
                        downloadResult: t('downloadResult'),
                    }}
                    canTranslate={Boolean(uploadedFile)}
                    isTranslating={isTranslating}
                    status={taskStatus}
                    translatedContent={translatedContent}
                    result={translationResult}
                    onTranslate={handleTranslateDocument}
                    onDownload={handleDownloadResult}
                />
            </div>
        </div>
    );
}
