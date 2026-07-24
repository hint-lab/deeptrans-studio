'use client';

import { fetchDictionaryDashboardAction } from '@/actions/dictionary';
import { createLogger } from '@/lib/logger';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from 'src/components/ui/button';
import { Separator } from 'src/components/ui/separator';
import { Skeleton } from 'src/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from 'src/components/ui/tabs';
import { AddPublicDictionaryDialog } from './components/add-public-dictionary-dialog';
import { CreateDictionaryDialog } from './components/create-dictionary-dialog';
import type { Dictionary as UIDictionary } from './components/dictionary-artwork';
import { DictionaryArtwork } from './components/dictionary-artwork';
import { DictionaryImportGuide } from './components/dictionary-import-guide';
import ImportDictionaryDialog from './components/import-dictionary-dialog';
const logger = createLogger(
    {
        type: 'dashboard:dictionaries',
    },
    {
        json: false, // 开启json格式输出
        pretty: false, // 关闭开发环境美化输出
        colors: true, // 仅当json：false时启用颜色输出可用
        includeCaller: false, // 日志不包含调用者
    }
);
export default function DictionariesPage() {
    const router = useRouter();
    const t = useTranslations('Dashboard.Dictionaries');
    const [publicDictionaries, setPublicDictionaries] = useState<UIDictionary[]>([]);
    const [projectDictionaries, setProjectDictionaries] = useState<UIDictionary[]>([]);
    const [privateDictionaries, setPrivateDictionaries] = useState<UIDictionary[]>([]);
    const [activeTab, setActiveTab] = useState('private');
    const searchParams = useSearchParams();
    const [loading, setLoading] = useState(true);
    const [authenticatedUserId, setAuthenticatedUserId] = useState<string>();

    // 加载词典数据
    const loadDictionaries = async () => {
        setLoading(true);
        try {
            const result = await fetchDictionaryDashboardAction();
            if (!result.success || !result.data) throw new Error(result.error || 'load failed');
            setAuthenticatedUserId(result.data.userId);

            const mapDictionary = (
                dictionary: any,
                visibility: UIDictionary['visibility']
            ): UIDictionary => ({
                id: dictionary.id,
                name: dictionary.name,
                description: dictionary.description ?? '',
                domain: dictionary.domain ?? 'general',
                visibility,
                cover: getDictionaryCover(dictionary.domain ?? 'general'),
                canWrite: dictionary.canWrite,
            });

            setPublicDictionaries(
                (result.data.publicDictionaries ?? []).map((dictionary: any) =>
                    mapDictionary(dictionary, 'PUBLIC')
                )
            );
            setProjectDictionaries(
                result.data.projectDictionaries.map((dictionary: any) =>
                    mapDictionary(dictionary, 'PROJECT')
                )
            );
            setPrivateDictionaries(
                (result.data.privateDictionaries ?? []).map((dictionary: any) =>
                    mapDictionary(dictionary, 'PRIVATE')
                )
            );
        } catch (error) {
            logger.error(t('loadErrorDesc'), error);
            toast.error(t('loadError'), { description: t('loadErrorDesc') as string });
        } finally {
            setLoading(false);
        }
    };

    // 根据领域获取词典封面
    const getDictionaryCover = (domain: string): string => {
        const coverMap: Record<string, string> = {
            general: '/images/dictionaries/common.svg',
            technology: '/images/dictionaries/tech.svg',
            legal: '/images/dictionaries/legal.svg',
            medical: '/images/dictionaries/medical.svg',
            finance: '/images/dictionaries/finance.svg',
            'artificial-intelligence': '/images/dictionaries/tech.svg',
            marketing: '/images/dictionaries/common.svg',
            engineering: '/images/dictionaries/tech.svg',
            education: '/images/dictionaries/common.svg',
            custom: '/images/dictionaries/default.svg',
        };
        return coverMap[domain] ?? '/images/dictionaries/default.svg';
    };

    useEffect(() => {
        void loadDictionaries();
    }, []);

    // 允许通过 URL 指定默认页签，如 /dashboard/dictionaries?tab=private
    useEffect(() => {
        try {
            const tab = (searchParams?.get('tab') || '').trim();
            if (tab === 'public' || tab === 'project' || tab === 'private') {
                setActiveTab(tab);
            }
        } catch {}
    }, [searchParams]);

    // 处理新词典创建
    const handleDictionaryCreated = (newDictionary: UIDictionary) => {
        if (newDictionary.visibility === 'PUBLIC') {
            setPublicDictionaries(prev => [newDictionary, ...prev]);
        } else if (newDictionary.visibility === 'PROJECT') {
            setProjectDictionaries(prev => [newDictionary, ...prev]);
        } else {
            setPrivateDictionaries(prev => [newDictionary, ...prev]);
        }
    };

    // 处理公共词典添加
    const handlePublicDictionaryAdded = (newDictionary: UIDictionary) => {
        setPublicDictionaries(prev => [newDictionary, ...prev]);
        toast.success(t('publicAdded'), { description: t('publicAdded') as string });
    };

    // 处理词典删除
    const handleDictionaryDeleted = (dictionaryId: string) => {
        // 从各个列表中移除被删除的词典
        setPublicDictionaries(prev => prev.filter(dict => dict.id !== dictionaryId));
        setProjectDictionaries(prev => prev.filter(dict => dict.id !== dictionaryId));
        setPrivateDictionaries(prev => prev.filter(dict => dict.id !== dictionaryId));

        toast.success(t('deleteSuccess'), { description: t('deleteSuccess') as string });
    };

    // 处理词典编辑
    const handleDictionaryEdited = (dictionaryId: string, updatedData: Partial<UIDictionary>) => {
        // 更新各个列表中的词典信息
        const updateDictionary = (dict: UIDictionary) =>
            dict.id === dictionaryId
                ? {
                      ...dict,
                      ...updatedData,
                      cover: getDictionaryCover(updatedData.domain ?? dict.domain),
                  }
                : dict;

        setPublicDictionaries(prev => prev.map(updateDictionary));
        setProjectDictionaries(prev => prev.map(updateDictionary));
        setPrivateDictionaries(prev => prev.map(updateDictionary));

        toast.success(t('editSuccess'), { description: t('editSuccess') as string });
    };

    // 处理词典选择
    const handleDictionarySelect = (dictionary: UIDictionary) => {
        router.push(`/dashboard/dictionaries/${dictionary.id}`);
    };

    if (loading) {
        return (
            <div className="mx-auto w-full max-w-7xl p-6">
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="space-y-2">
                            <Skeleton className="h-6 w-40" />
                            <Skeleton className="h-4 w-64" />
                        </div>
                        <div className="flex items-center gap-2">
                            <Skeleton className="h-9 w-28" />
                            <Skeleton className="h-9 w-28" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                        {Array.from({ length: 10 }).map((_, i) => (
                            <Skeleton key={i} className="h-[280px] w-full" />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto w-full max-w-7xl p-6">
            <div className="mb-4">
                <h1 className="mb-1 text-3xl font-bold text-gray-900 dark:text-white">
                    {t('title')}
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('description')}</p>
            </div>

            <DictionaryImportGuide />

            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full space-y-6">
                <div className="space-between flex items-center">
                    <TabsList>
                        <TabsTrigger value="public" className="relative">
                            {t('publicDictionaries')}
                        </TabsTrigger>
                        <TabsTrigger value="private">{t('privateDictionaries')}</TabsTrigger>
                        <TabsTrigger value="project" className="relative">
                            {t('projectDictionaries')}
                        </TabsTrigger>
                    </TabsList>
                </div>

                {/* 公共词库 */}
                <TabsContent value="public" className="border-none p-0 outline-none">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">
                                {t('publicDescription')}
                            </p>
                        </div>
                        <div className="ml-auto flex items-center gap-2">
                            <AddPublicDictionaryDialog
                                onDictionaryAdded={handlePublicDictionaryAdded}
                                userId={authenticatedUserId}
                            />
                        </div>
                    </div>
                    <Separator className="my-4" />
                    {publicDictionaries.length > 0 ? (
                        <div className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                            {publicDictionaries.map(dictionary => (
                                <DictionaryArtwork
                                    key={dictionary.id}
                                    dictionary={{
                                        ...dictionary,
                                        description: dictionary.description ?? undefined,
                                    }}
                                    className="w-full cursor-pointer hover:opacity-80"
                                    aspectRatio="portrait"
                                    width={200}
                                    height={280}
                                    onClick={() => handleDictionarySelect(dictionary)}
                                    onDelete={undefined}
                                    onEdit={undefined}
                                    showDeleteButton={false}
                                    showEditButton={false}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="py-8 text-center">
                            <div className="space-y-4">
                                <div className="text-muted-foreground">
                                    <p className="mb-2">{t('publicEmptyTitle')}</p>
                                    <p className="text-sm">{t('publicEmptyDesc')}</p>
                                </div>
                                <AddPublicDictionaryDialog
                                    onDictionaryAdded={handlePublicDictionaryAdded}
                                    userId={authenticatedUserId}
                                />
                            </div>
                        </div>
                    )}
                </TabsContent>

                {/* 私有词库 */}
                <TabsContent
                    value="private"
                    className="h-full flex-col border-none p-0 data-[state=active]:flex"
                >
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">
                                {authenticatedUserId
                                    ? t('privateDescription')
                                    : t('privateLoginRequired')}
                            </p>
                        </div>
                        <div className="ml-auto flex items-center gap-2">
                            <ImportDictionaryDialog
                                modeContext="private"
                                dictionaries={undefined}
                                userId={authenticatedUserId}
                                onImported={() => {
                                    void loadDictionaries();
                                    toast.success(t('importComplete'), {
                                        description: t('projectImported') as string,
                                    });
                                }}
                            />
                            <CreateDictionaryDialog
                                onDictionaryCreated={d =>
                                    handleDictionaryCreated(d as unknown as UIDictionary)
                                }
                                userId={authenticatedUserId}
                                visibility="PRIVATE"
                            />
                        </div>
                    </div>
                    <Separator className="my-4" />
                    {!authenticatedUserId ? (
                        <div className="py-8 text-center">
                            <p className="mb-4 text-muted-foreground">{t('loginRequired')}</p>
                            <Button asChild>
                                <a href="/auth/login">{t('goLogin')}</a>
                            </Button>
                        </div>
                    ) : privateDictionaries.length > 0 ? (
                        <div className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                            {privateDictionaries.map(dictionary => (
                                <DictionaryArtwork
                                    key={dictionary.id}
                                    dictionary={{
                                        ...dictionary,
                                        description: dictionary.description ?? undefined,
                                    }}
                                    className="w-full cursor-pointer hover:opacity-80"
                                    aspectRatio="portrait"
                                    width={200}
                                    height={280}
                                    onClick={() => handleDictionarySelect(dictionary)}
                                    onDelete={handleDictionaryDeleted}
                                    onEdit={handleDictionaryEdited}
                                    showDeleteButton={true}
                                    showEditButton={true}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="py-8 text-center">
                            <div className="space-y-4">
                                <div className="text-muted-foreground">
                                    <p className="mb-2">{t('privateEmptyTitle')}</p>
                                    <p className="text-sm">{t('privateEmptyDesc')}</p>
                                </div>
                                <ImportDictionaryDialog
                                    modeContext="private"
                                    dictionaries={undefined}
                                    userId={authenticatedUserId}
                                    onImported={() => {
                                        void loadDictionaries();
                                        toast.success(t('importComplete'), {
                                            description: t('privateImported') as string,
                                        });
                                    }}
                                />
                            </div>
                        </div>
                    )}
                </TabsContent>

                {/* 项目词库 */}
                <TabsContent value="project" className="border-none p-0 outline-none">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">
                                {t('projectDescription')}
                            </p>
                        </div>
                        <div className="ml-auto flex items-center gap-2">
                            <ImportDictionaryDialog
                                modeContext="project"
                                dictionaries={undefined}
                                userId={authenticatedUserId}
                                onImported={() => {
                                    void loadDictionaries();
                                    toast.success(t('importComplete'), {
                                        description: t('projectImported') as string,
                                    });
                                }}
                            />

                            <CreateDictionaryDialog
                                onDictionaryCreated={d =>
                                    handleDictionaryCreated(d as unknown as UIDictionary)
                                }
                                userId={authenticatedUserId}
                                visibility="PROJECT"
                            />
                        </div>
                    </div>
                    <Separator className="my-4" />
                    {!authenticatedUserId ? (
                        <div className="py-8 text-center">
                            <p className="mb-4 text-muted-foreground">
                                {t('projectLoginRequired')}
                            </p>
                            <Button asChild>
                                <a href="/auth/login">{t('goLogin')}</a>
                            </Button>
                        </div>
                    ) : projectDictionaries.length > 0 ? (
                        <div className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                            {projectDictionaries.map(dictionary => (
                                <DictionaryArtwork
                                    key={dictionary.id}
                                    dictionary={{
                                        ...dictionary,
                                        description: dictionary.description ?? undefined,
                                    }}
                                    className="w-full cursor-pointer hover:opacity-80"
                                    aspectRatio="portrait"
                                    width={200}
                                    height={280}
                                    onClick={() => handleDictionarySelect(dictionary)}
                                    onDelete={
                                        dictionary.canWrite ? handleDictionaryDeleted : undefined
                                    }
                                    onEdit={handleDictionaryEdited}
                                    showDeleteButton={dictionary.canWrite === true}
                                    showEditButton={false}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="py-8 text-center">
                            <div className="space-y-4">
                                <div className="text-muted-foreground">
                                    <p className="mb-2">{t('projectEmptyTitle')}</p>
                                    <p className="text-sm">{t('projectEmptyDesc')}</p>
                                </div>
                                <div className="flex justify-center gap-2">
                                    <ImportDictionaryDialog
                                        modeContext="project"
                                        dictionaries={undefined}
                                        userId={authenticatedUserId}
                                        onImported={() => {
                                            void loadDictionaries();
                                            toast.success(t('importComplete'), {
                                                description: t('projectImported') as string,
                                            });
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
}
