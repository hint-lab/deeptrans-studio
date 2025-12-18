'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
// 去掉 Card，使用自定义样式容器
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';

import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
    ArrowRightLeft,
    Copy,
    Volume2,
    Loader2,
    Settings,
    Search,
    FileText,
    Globe,
} from 'lucide-react';
import { embedAndTranslateAction as textTranslate } from '@/actions/pre-translate';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { fetchDictionariesAction, fetchDictionaryEntriesAction } from '@/actions/dictionary';
import { Skeleton } from '@/components/ui/skeleton';
import { LANGUAGES } from '@/constants/languages';
import { useTranslations } from 'next-intl';

// 动态语言和翻译风格选项 - 将在组件内部基于翻译创建

// 词典与词条类型（仅使用到的字段）
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

interface DictEntry {
    term: string;
    translation: string;
    notes?: string;
}
export default function InstantTranslatePage() {
    const { data: session } = useSession();
    const tDashboard = useTranslations('Dashboard');
    const t = useTranslations('Dashboard.InstantTranslate');
    const langT = useTranslations('Common.languages');

    // 动态语言选项
    const languages = [
        { key: 'auto', label: tDashboard('autoDetect') },
        ...LANGUAGES.map(lang => ({
            key: lang.key,
            label: langT(lang.labelKey),
        })),
    ];

    const translationStyles = [
        { key: 'formal', label: tDashboard('formal'), description: tDashboard('formalDesc') },
        { key: 'casual', label: tDashboard('casual'), description: tDashboard('casualDesc') },
        {
            key: 'technical',
            label: tDashboard('technical'),
            description: tDashboard('technicalDesc'),
        },
        { key: 'creative', label: tDashboard('creative'), description: tDashboard('creativeDesc') },
        { key: 'academic', label: tDashboard('academic'), description: tDashboard('academicDesc') },
    ];
    const [sourceText, setSourceText] = useState('');
    const [translatedText, setTranslatedText] = useState('');
    const [sourceLanguage, setSourceLanguage] = useState('auto');
    const [targetLanguage, setTargetLanguage] = useState('zh');
    const [isTranslating, setIsTranslating] = useState(false);
    const [autoTranslate, setAutoTranslate] = useState(true);
    const [translationStyle, setTranslationStyle] = useState('formal');
    const [selectedDictionaries, setSelectedDictionaries] = useState<string[]>([]);
    // 公共和私有词典
    const [publicDictionaries, setPublicDictionaries] = useState<DictionarySummary[]>([]);
    const [privateDictionaries, setPrivateDictionaries] = useState<DictionarySummary[]>([]);
    const [loadingDictionaries, setLoadingDictionaries] = useState(false);
    // 词典词条懒加载
    const [expandedDictionaryIds, setExpandedDictionaryIds] = useState<string[]>([]);
    const [dictionaryEntriesById, setDictionaryEntriesById] = useState<
        Record<string, DictionaryEntryItem[]>
    >({});
    const [loadingEntries, setLoadingEntries] = useState<Record<string, boolean>>({});
    const [dictionarySearch, setDictionarySearch] = useState('');
    const [dictionaryDialogOpen, setDictionaryDialogOpen] = useState(false);

    // 添加防抖定时器引用
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
    // 添加请求取消引用
    const abortControllerRef = useRef<AbortController | null>(null);
    // 添加请求序号，防止竞态
    const requestIdRef = useRef(0);

    // 计算动态延时（根据文本长度）
    const getDebounceDelay = (text: string) => {
        const len = text.trim().length;
        if (len < 100) return 300;
        if (len < 500) return 600;
        return 1000;
    };

    const getSelectedDictionaryEntries = async (): Promise<DictEntry[]> => {
        if (selectedDictionaries.length === 0) return [];

        try {
            const allEntries: DictEntry[] = [];

            // 为每个选中的词典获取条目
            for (const dictId of selectedDictionaries) {
                // 如果已经加载过条目，直接使用
                if (dictionaryEntriesById[dictId]) {
                    const entries = dictionaryEntriesById[dictId];
                    allEntries.push(
                        ...entries.map(entry => ({
                            term: entry.sourceText,
                            translation: entry.targetText,
                            notes: entry.notes || undefined,
                        }))
                    );
                } else {
                    // 如果没有加载过，先加载
                    const res = await fetchDictionaryEntriesAction(dictId);
                    if (res.success && res.data) {
                        const entries = res.data as unknown as DictionaryEntryItem[];
                        allEntries.push(
                            ...entries.map(entry => ({
                                term: entry.sourceText,
                                translation: entry.targetText,
                                notes: entry.notes || undefined,
                            }))
                        );
                    }
                }
            }

            return allEntries;
        } catch (error) {
            console.error('获取词典条目失败:', error);
            return [];
        }
    };
    // 真正的防抖翻译函数
    const debouncedTranslate = useCallback(
        async (text: string, source: string, target: string, style: string) => {
            // 清除之前的定时器
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }

            const delay = getDebounceDelay(text);

            // 创建新的防抖定时器
            debounceTimerRef.current = setTimeout(async () => {
                if (!text.trim()) {
                    setTranslatedText('');
                    return;
                }

                // 验证目标语言
                if (target === 'auto') {
                    toast.error(t('pleaseSelectTargetLanguage'), {
                        description: t('targetCannotBeAuto'),
                    });
                    return;
                }

                // 记录当前请求序号
                const localRequestId = ++requestIdRef.current;

                setIsTranslating(true);
                try {
                    // 获取选中的词典条目
                    const dictEntries = await getSelectedDictionaryEntries();

                    const result: string = await textTranslate(
                        text,
                        source,
                        target,
                        dictEntries, // 传递术语库条目
                        { prompt: `使用${translationStyle}风格翻译` }
                    );

                    // 仅处理最新的请求结果，避免旧请求覆盖
                    if (localRequestId === requestIdRef.current) {
                        setTranslatedText(result);
                    }
                } catch (error: unknown) {
                    console.error('翻译错误:', error);
                    toast.error(t('translationFailed'), { description: t('retryLater') });
                } finally {
                    if (localRequestId === requestIdRef.current) {
                        setIsTranslating(false);
                    }
                }
            }, delay);
        },
        [toast, selectedDictionaries, translationStyle, dictionaryEntriesById]
    );

    // 适配语言列表：源语言支持自动检测
    const sourceLanguages = languages;

    // 自动翻译
    useEffect(() => {
        if (autoTranslate && sourceText && targetLanguage !== 'auto') {
            debouncedTranslate(sourceText, sourceLanguage, targetLanguage, translationStyle);
        } else if (!sourceText) {
            setTranslatedText('');
        }
    }, [
        sourceText,
        sourceLanguage,
        targetLanguage,
        autoTranslate,
        translationStyle,
        debouncedTranslate,
    ]);

    // 组件卸载时清理
    useEffect(() => {
        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

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
                console.error('加载词典失败', e);
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
                console.log('加载词条此单ID:', dictionaryId);
                const res = await fetchDictionaryEntriesAction(dictionaryId);
                console.log('加载词条结果:', res);
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

    // 手动翻译
    const handleManualTranslate = async () => {
        if (!sourceText.trim()) {
            toast.error(t('pleaseEnterText'));
            return;
        }

        // 验证目标语言
        if (targetLanguage === 'auto') {
            toast.error('请选择目标语言', { description: '目标语言不能设置为自动检测' });
            return;
        }

        // 记录当前请求序号
        const localRequestId = ++requestIdRef.current;

        setIsTranslating(true);
        try {
            // 获取选中的词典条目
            const dictEntries = await getSelectedDictionaryEntries();

            const result: string = await textTranslate(
                sourceText,
                sourceLanguage,
                targetLanguage,
                dictEntries, // 传递术语库条目
                { prompt: `使用${translationStyle}风格翻译` }
            );

            if (localRequestId === requestIdRef.current) {
                setTranslatedText(result);
            }
        } catch (error: unknown) {
            console.error('翻译错误:', error);
            toast.error('翻译失败', { description: '请稍后重试' });
        } finally {
            if (localRequestId === requestIdRef.current) {
                setIsTranslating(false);
            }
        }
    };

    // 交换语言
    const swapLanguages = () => {
        if (sourceLanguage !== 'auto') {
            // 确保交换后的目标语言不是auto
            const newTargetLanguage = sourceLanguage;
            const newSourceLanguage = targetLanguage;

            setSourceLanguage(newSourceLanguage);
            setTargetLanguage(newTargetLanguage);
            setSourceText(translatedText);
            setTranslatedText('');
        }
    };

    // 复制文本
    const copyText = (text: string, type: 'source' | 'target') => {
        void navigator.clipboard.writeText(text);
        toast.success(type === 'source' ? t('sourceTextCopied') : t('translatedTextCopied'));
    };

    // 语音朗读
    const speakText = (text: string, lang: string) => {
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(text);
            const resolved = lang === 'auto' ? 'zh-CN' : lang;
            utterance.lang = resolved;
            speechSynthesis.speak(utterance);
        }
    };

    // 检测源文本语言
    const detectLanguage = async (text: string) => {
        if (!text.trim() || sourceLanguage !== 'auto') return;

        try {
            // 使用翻译API检测语言
            const result: string = await textTranslate(
                text.substring(0, 100), // 只检测前100个字符
                'auto',
                'zh' // 临时目标语言，用于检测
            );

            // 这里可以根据返回结果推断源语言
            // 由于OpenAI API的限制，我们只能通过其他方式检测
            // 暂时保持auto状态
        } catch (error) {
            console.error('语言检测失败:', error);
        }
    };

    // 当源文本改变时，如果是auto模式则尝试检测语言
    useEffect(() => {
        if (sourceLanguage === 'auto' && sourceText.trim()) {
            const timer = setTimeout(() => {
                void detectLanguage(sourceText);
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [sourceText, sourceLanguage]);

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

            {/* 语言选择和控制栏 */}
            <div className="mb-6 flex items-center justify-between rounded-lg bg-white p-4 dark:bg-gray-800">
                <div className="flex items-center space-x-4">
                    <Select
                        value={sourceLanguage}
                        onValueChange={value => setSourceLanguage(value)}
                    >
                        <SelectTrigger className="w-40 border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white">
                            <SelectValue placeholder={t('selectSourceLanguage')} />
                        </SelectTrigger>
                        <SelectContent className="border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800">
                            {languages.map(lang => (
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

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={swapLanguages}
                        disabled={sourceLanguage === 'auto'}
                        className="p-2"
                    >
                        <ArrowRightLeft className="h-4 w-4" />
                    </Button>

                    <div className="flex flex-col">
                        <Select
                            value={targetLanguage}
                            onValueChange={value => setTargetLanguage(value)}
                        >
                            <SelectTrigger className="w-40 border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white">
                                <SelectValue placeholder={t('selectTargetLanguage')} />
                            </SelectTrigger>
                            <SelectContent className="border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800">
                                {languages
                                    .filter(lang => lang.key !== 'auto')
                                    .map(lang => (
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
                    {/* 翻译风格选择 */}
                    <Select
                        value={translationStyle}
                        onValueChange={value => setTranslationStyle(value)}
                    >
                        <SelectTrigger className="w-32 border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white">
                            <SelectValue placeholder={t('translationStyle')} />
                        </SelectTrigger>
                        <SelectContent className="border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800">
                            {translationStyles.map(style => (
                                <SelectItem
                                    key={style.key}
                                    value={style.key}
                                    className="text-gray-900 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-700"
                                >
                                    {style.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* 词库选择弹窗按钮 */}
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
                                                                            {dictionary.description}
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
                                                                            {dictionary.description}
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

                    <div className="flex items-center space-x-2">
                        <Switch
                            id="auto-translate"
                            checked={autoTranslate}
                            onCheckedChange={setAutoTranslate}
                        />
                        <Label htmlFor="auto-translate">{t('autoTranslate')}</Label>
                    </div>

                    {!autoTranslate && (
                        <Button onClick={handleManualTranslate} disabled={isTranslating}>
                            {isTranslating ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    {t('translating')}
                                </>
                            ) : (
                                t('translate')
                            )}
                        </Button>
                    )}
                </div>
            </div>

            {/* 翻译区域（自定义样式容器） */}
            <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* 原文 */}
                <div className="h-100 rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                    <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                        <div className="flex items-center justify-between">
                            <div className="text-lg font-medium">{t('sourceText')}</div>
                            <div className="flex items-center space-x-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => speakText(sourceText, sourceLanguage)}
                                    disabled={!sourceText}
                                >
                                    <Volume2 className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => copyText(sourceText, 'source')}
                                    disabled={!sourceText}
                                >
                                    <Copy className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                    <div className="p-4">
                        <Textarea
                            value={sourceText}
                            onChange={e => setSourceText(e.target.value)}
                            placeholder={t('enterTextPlaceholder')}
                            className="h-80 resize-none border-0 text-lg shadow-none focus-visible:ring-0"
                        />
                    </div>
                </div>

                {/* 译文 */}
                <div className="h-100 rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                        <div className="flex items-center justify-between">
                            <div className="text-lg font-medium">{t('translatedText')}</div>
                            <div className="flex items-center space-x-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => speakText(translatedText, targetLanguage)}
                                    disabled={!translatedText}
                                >
                                    <Volume2 className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => copyText(translatedText, 'target')}
                                    disabled={!translatedText}
                                >
                                    <Copy className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                    <div className="p-4">
                        {isTranslating ? (
                            <Skeleton className="h-80 w-full rounded-md" />
                        ) : (
                            <Textarea
                                value={translatedText}
                                readOnly
                                placeholder={t('resultPlaceholder')}
                                className="h-80 resize-none border-0 text-lg shadow-none focus-visible:ring-0"
                            />
                        )}
                    </div>
                </div>
            </div>

            {/* 词典区域（已移入弹窗） */}

            {/* 字符统计 */}
            <div className="mt-4 flex justify-between text-sm text-gray-500">
                <span>
                    {t('sourceCharCount')}: {sourceText.length}
                </span>
                <span>
                    {t('targetCharCount')}: {translatedText.length}
                </span>
            </div>
        </div>
    );
}
