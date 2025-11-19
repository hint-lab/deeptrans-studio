"use client"

import { useState, useEffect, useMemo } from "react"
import { useSession } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import { Separator } from "src/components/ui/separator"
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "src/components/ui/tabs"
import { Button } from "src/components/ui/button"
import type { Dictionary as UIDictionary } from "./components/dictionary-artwork"
import { DictionaryArtwork } from "./components/dictionary-artwork"
import { CreateDictionaryDialog } from "./components/create-dictionary-dialog"
import { DictionaryEntriesManager } from "./components/dictionary-entries-manager"
import { fetchDictionariesAction } from "@/actions/dictionary"
import { toast } from "sonner"
import ImportDictionaryDialog from "./components/import-dictionary-dialog"
import { Skeleton } from "src/components/ui/skeleton"
import { AddPublicDictionaryDialog } from "./components/add-public-dictionary-dialog"
import { useTranslations } from "next-intl"


export default function DictionariesPage() {
    const { data: session } = useSession()
    const router = useRouter()
    const t = useTranslations("Dashboard.Dictionaries")
    const [publicDictionaries, setPublicDictionaries] = useState<UIDictionary[]>([])
    const [projectDictionaries, setProjectDictionaries] = useState<UIDictionary[]>([])
    const [privateDictionaries, setPrivateDictionaries] = useState<UIDictionary[]>([])
    const [selectedDictionary, setSelectedDictionary] = useState<UIDictionary | null>(null)
    const [activeTab, setActiveTab] = useState("private")
    const searchParams = useSearchParams()
    const [loading, setLoading] = useState(true)
    const [reloadToken, setReloadToken] = useState(0)

    // 汇总可供导入的词库（全部）
    const allDictionariesLite = useMemo(() => {
        const all = [...publicDictionaries, ...projectDictionaries, ...privateDictionaries]
        // 去重
        const map = new Map<string, { id: string; name: string }>()
        all.forEach(d => map.set(d.id, { id: d.id, name: d.name }))
        return Array.from(map.values())
    }, [publicDictionaries, projectDictionaries, privateDictionaries])

    // 加载词典数据
    const loadDictionaries = async () => {
        setLoading(true)
        try {
            // 公共词库
            try {
                const pubRes = await fetchDictionariesAction("public")
                if (pubRes.success && pubRes.data) {
                    const publicDicts: UIDictionary[] = pubRes.data.map((d: any) => ({
                        id: d.id,
                        name: d.name,
                        description: d.description ?? "",
                        domain: d.domain ?? 'general',
                        visibility: 'PUBLIC' as const,
                        createdAt: new Date(d.createdAt as any),
                        updatedAt: new Date(d.updatedAt as any),
                        tenantId: (d as any).tenantId ?? null,
                        projectId: (d as any).projectId ?? null,
                        userId: d.userId ?? null,
                        cover: getDictionaryCover(d.domain ?? 'general')
                    }))
                    setPublicDictionaries(publicDicts)
                } else {
                    setPublicDictionaries([])
                }
            } catch (e) {
                console.error(t("loadPublicFailed"), e)
            }
            // 项目词库
            try {
                const projectRes = await fetchDictionariesAction("project")
                if (projectRes.success && projectRes.data) {
                    const projDicts: UIDictionary[] = projectRes.data.map((d: any) => ({
                        id: d.id,
                        name: d.name,
                        description: d.description ?? "",
                        domain: d.domain ?? 'general',
                        visibility: 'PROJECT' as const,
                        createdAt: new Date(d.createdAt as any),
                        updatedAt: new Date(d.updatedAt as any),
                        tenantId: (d as any).tenantId ?? null,
                        projectId: (d as any).projectId ?? null,
                        userId: d.userId ?? null,
                        cover: getDictionaryCover(d.domain ?? 'general')
                    }))
                    setProjectDictionaries(projDicts)
                } else {
                    setProjectDictionaries([])
                }
            } catch (e) {
                console.error(t("loadProjectFailed"), e)
            }

            // 私有词库（需登录）
            if (session?.user?.id) {
                const privateResult = await fetchDictionariesAction("private", session.user.id)
                if (privateResult.success && privateResult.data) {
                    const privateDicts: UIDictionary[] = privateResult.data.map((dict: any) => ({
                        id: dict.id,
                        name: dict.name,
                        description: dict.description ?? "",
                        domain: dict.domain,
                        visibility: 'PRIVATE' as const,
                        createdAt: new Date(dict.createdAt as any),
                        updatedAt: new Date(dict.updatedAt as any),
                        tenantId: (dict as any).tenantId ?? null,
                        projectId: (dict as any).projectId ?? null,
                        userId: dict.userId ?? null,
                        cover: getDictionaryCover(dict.domain)
                    }))
                    setPrivateDictionaries(privateDicts)
                }
            } else {
                setPrivateDictionaries([])
            }
        } catch (error) {
            console.error(t("loadErrorDesc"), error)
            toast.error(t("loadError"), { description: t("loadErrorDesc") as string })
        } finally {
            setLoading(false)
        }
    }

    // 根据领域获取词典封面
    const getDictionaryCover = (domain: string): string => {
        const coverMap: Record<string, string> = {
            'general': '/images/dictionaries/common.svg',
            'technology': '/images/dictionaries/tech.svg',
            'legal': '/images/dictionaries/legal.svg',
            'medical': '/images/dictionaries/medical.svg',
            'finance': '/images/dictionaries/finance.svg',
            'artificial-intelligence': '/images/dictionaries/tech.svg',
            'marketing': '/images/dictionaries/common.svg',
            'engineering': '/images/dictionaries/tech.svg',
            'education': '/images/dictionaries/common.svg',
            'custom': '/images/dictionaries/default.svg'
        }
        return coverMap[domain] ?? '/images/dictionaries/default.svg'
    }

    useEffect(() => {
        void loadDictionaries()
    }, [session?.user?.id])

    // 允许通过 URL 指定默认页签，如 /dashboard/dictionaries?tab=private
    useEffect(() => {
        try {
            const tab = (searchParams?.get('tab') || '').trim()
            if (tab === 'public' || tab === 'project' || tab === 'private') {
                setActiveTab(tab)
            }
        } catch { }
    }, [searchParams])

    // 处理新词典创建
    const handleDictionaryCreated = (newDictionary: UIDictionary) => {
        if (newDictionary.visibility === 'PUBLIC') {
            setPublicDictionaries(prev => [newDictionary, ...prev])
        } else if (newDictionary.visibility === 'PROJECT') {
            setProjectDictionaries(prev => [newDictionary, ...prev])
        } else {
            setPrivateDictionaries(prev => [newDictionary, ...prev])
        }
    }

    // 处理项目词典添加
    const handleTeamDictionaryAdded = (newDictionary: UIDictionary) => {
        setProjectDictionaries(prev => [newDictionary, ...prev])
        toast.success(t("projectAdded"), { description: t("projectAdded") as string })  
    }

    // 处理公共词典添加
    const handlePublicDictionaryAdded = (newDictionary: UIDictionary) => {
        setPublicDictionaries(prev => [newDictionary, ...prev])
        toast.success(t("publicAdded"), { description: t("publicAdded") as string }) 
    }

    // 处理词典条目更新
    const handleEntriesUpdated = () => {
        // 重新加载词典数据以更新条目数量
        void loadDictionaries()
    }

    // 处理词典删除
    const handleDictionaryDeleted = (dictionaryId: string) => {
        // 从各个列表中移除被删除的词典
        setPublicDictionaries(prev => prev.filter(dict => dict.id !== dictionaryId))
        setProjectDictionaries(prev => prev.filter(dict => dict.id !== dictionaryId))
        setPrivateDictionaries(prev => prev.filter(dict => dict.id !== dictionaryId))

        // 如果删除的是当前选中的词典，清除选择
        if (selectedDictionary?.id === dictionaryId) {
            setSelectedDictionary(null)
            setActiveTab("private")
        }

        toast.success(t("deleteSuccess"), { description: t("deleteSuccess") as string }) 
    }   

    // 处理词典编辑
    const handleDictionaryEdited = (dictionaryId: string, updatedData: Partial<UIDictionary>) => {
        // 更新各个列表中的词典信息
        const updateDictionary = (dict: UIDictionary) =>
            dict.id === dictionaryId
                ? { ...dict, ...updatedData, cover: getDictionaryCover(updatedData.domain ?? dict.domain) }
                : dict

        setPublicDictionaries(prev => prev.map(updateDictionary))
        setProjectDictionaries(prev => prev.map(updateDictionary))
        setPrivateDictionaries(prev => prev.map(updateDictionary))

        // 如果编辑的是当前选中的词典，更新选择状态
        if (selectedDictionary?.id === dictionaryId) {
            setSelectedDictionary(prev => prev ? { ...prev, ...updatedData, cover: getDictionaryCover(updatedData.domain ?? prev.domain) } : null)
        }

        toast.success(t("editSuccess"), { description: t("editSuccess") as string }) 
    }

    // 处理词典选择
    const handleDictionarySelect = (dictionary: UIDictionary) => {
        router.push(`/dashboard/dictionaries/${dictionary.id}`)
    }

    if (loading) {
        return (
            <div className="w-full max-w-7xl mx-auto p-6">
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
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                        {Array.from({ length: 10 }).map((_, i) => (
                            <Skeleton key={i} className="h-[280px] w-full" />
                        ))}
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="w-full max-w-7xl mx-auto p-6">
            <div className="mb-4">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">{t("title")}</h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t("description")}</p>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full space-y-6">
                <div className="space-between flex items-center">
                    <TabsList>
                        <TabsTrigger value="public" className="relative">
                            {t("publicDictionaries")}
                        </TabsTrigger>
                        <TabsTrigger value="private">
                            {t("privateDictionaries")}
                        </TabsTrigger>
                        <TabsTrigger value="project" className="relative">
                            {t("projectDictionaries")}
                        </TabsTrigger>
                    </TabsList>
                </div>

                {/* 公共词库 */}
                <TabsContent
                    value="public"
                    className="border-none p-0 outline-none"
                >
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">
                                {t("publicDescription")}
                            </p>
                        </div>
                        <div className="ml-auto flex items-center gap-2">
                            <AddPublicDictionaryDialog
                                onDictionaryAdded={handlePublicDictionaryAdded}
                                userId={session?.user?.id}
                            />
                        </div>
                    </div>
                    <Separator className="my-4" />
                    {publicDictionaries.length > 0 ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                            {publicDictionaries.map((dictionary) => (
                                <DictionaryArtwork
                                    key={dictionary.id}
                                    dictionary={{ ...dictionary, description: dictionary.description ?? undefined }}
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
                        <div className="text-center py-8">
                            <div className="space-y-4">
                                <div className="text-muted-foreground">
                                    <p className="mb-2">{t("publicEmptyTitle")}</p>
                                    <p className="text-sm">{t("publicEmptyDesc")}</p>
                                </div>
                                <AddPublicDictionaryDialog
                                    onDictionaryAdded={handlePublicDictionaryAdded}
                                    userId={session?.user?.id}
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
                                {session?.user?.id
                                    ? t("privateDescription")
                                    : t("privateLoginRequired")
                                }
                            </p>
                        </div>
                        <div className="ml-auto flex items-center gap-2">
                            <ImportDictionaryDialog
                                modeContext="private"
                                dictionaries={undefined}
                                userId={session?.user?.id}
                                onImported={() => {
                                    setReloadToken((t) => t + 1)
                                    void loadDictionaries()
                                    toast.success(t("importComplete"), { description: t("projectImported") as string }) 
                                }}
                            />
                            <CreateDictionaryDialog
                                onDictionaryCreated={(d) => handleDictionaryCreated(d as unknown as UIDictionary)}
                                userId={session?.user?.id}
                            />
                        </div>
                    </div>
                    <Separator className="my-4" />
                    {!session?.user?.id ? (
                        <div className="text-center py-8">
                            <p className="text-muted-foreground mb-4">{t("loginRequired")}</p>
                            <Button asChild>
                                <a href="/auth/login">{t("goLogin")}</a>
                            </Button>
                        </div>
                    ) : privateDictionaries.length > 0 ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                            {privateDictionaries.map((dictionary) => (
                                <DictionaryArtwork
                                    key={dictionary.id}
                                    dictionary={{ ...dictionary, description: dictionary.description ?? undefined }}
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
                        <div className="text-center py-8">
                            <div className="space-y-4">
                                <div className="text-muted-foreground">
                                    <p className="mb-2">{t("privateEmptyTitle")}</p>
                                    <p className="text-sm">{t("privateEmptyDesc")}</p>
                                </div>
                                <ImportDictionaryDialog
                                    modeContext="private"
                                    dictionaries={undefined}
                                    userId={session?.user?.id}
                                    onImported={() => {
                                        void loadDictionaries()
                                        toast.success(t("importComplete"), { description: t("privateImported") as string }) 
                                    }}
                                />
                            </div>
                        </div>
                    )}
                </TabsContent>

                {/* 项目词库 */}
                <TabsContent
                    value="project"
                    className="border-none p-0 outline-none"
                >
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">
                                {t("projectDescription")}
                            </p>
                        </div>
                        <div className="ml-auto flex items-center gap-2">
                            <ImportDictionaryDialog
                                modeContext="project"
                                dictionaries={undefined}
                                userId={session?.user?.id}
                                onImported={() => {
                                    setReloadToken((t) => t + 1)
                                    void loadDictionaries()
                                    toast.success(t("importComplete"), { description: t("projectImported") as string }) 
                                }}
                            />

                            <CreateDictionaryDialog
                                onDictionaryCreated={(d) => handleDictionaryCreated(d as unknown as UIDictionary)}
                                userId={session?.user?.id}
                            />
                        </div>
                    </div>
                    <Separator className="my-4" />
                    {!session?.user?.id ? (
                        <div className="text-center py-8">
                            <p className="text-muted-foreground mb-4">{t("projectLoginRequired")}</p>
                            <Button asChild>
                                <a href="/auth/login">{t("goLogin")}</a>
                            </Button>
                        </div>
                    ) : projectDictionaries.length > 0 ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                            {projectDictionaries.map((dictionary) => (
                                <DictionaryArtwork
                                    key={dictionary.id}
                                    dictionary={{ ...dictionary, description: dictionary.description ?? undefined }}
                                    className="w-full cursor-pointer hover:opacity-80"
                                    aspectRatio="portrait"
                                    width={200}
                                    height={280}
                                    onClick={() => handleDictionarySelect(dictionary)}
                                    onDelete={handleDictionaryDeleted}
                                    onEdit={handleDictionaryEdited}
                                    showDeleteButton={true}
                                    showEditButton={false}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <div className="space-y-4">
                                <div className="text-muted-foreground">
                                    <p className="mb-2">{t("projectEmptyTitle")}</p>
                                    <p className="text-sm">{t("projectEmptyDesc")}</p>
                                </div>
                                <div className="flex justify-center gap-2">
                                    <ImportDictionaryDialog
                                        modeContext="project"
                                        dictionaries={undefined}
                                        userId={session?.user?.id}
                                        onImported={() => {
                                            void loadDictionaries()
                                            toast.success(t("importComplete"), { description: t("projectImported") as string }) 
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    )
}