"use client"

import { useState, useEffect } from "react"
import { Button } from "src/components/ui/button"
import { Input } from "src/components/ui/input"
import { Label } from "src/components/ui/label"
import { Textarea } from "src/components/ui/textarea"
import { ScrollArea } from "src/components/ui/scroll-area"
import { Card, CardContent, CardHeader, CardTitle } from "src/components/ui/card"
import { Plus, Search, Edit, Trash2, Edit3 } from "lucide-react"
import type { Dictionary, DictionaryEntry } from "@prisma/client"
import { Switch } from "src/components/ui/switch"
import { 
    createDictionaryEntryAction, 
    updateDictionaryEntryAction, 
    deleteDictionaryEntryAction,
    fetchDictionaryEntriesAction,
    searchDictionaryEntriesAction,
    deleteDictionaryAction,
    fetchDictionaryEntriesPagedAction
} from "@/actions/dictionary"
import { toast } from "sonner"
import { ImportDictionaryEntriesDialog } from "./import-dictionary-entries-dialog"
import { EditDictionaryDialog } from "./edit-dictionary-dialog"

interface DictionaryEntriesManagerProps {
    dictionary: Dictionary
    onEntriesUpdated: () => void
    onDictionaryDeleted?: (dictionaryId: string) => void
    onDictionaryEdited?: (dictionaryId: string, updatedData: Partial<Dictionary>) => void
    reloadToken?: number
}

export function DictionaryEntriesManager({ 
    dictionary, 
    onEntriesUpdated,
    onDictionaryDeleted,
    onDictionaryEdited,
    reloadToken
}: DictionaryEntriesManagerProps) {
    const [entries, setEntries] = useState<DictionaryEntry[]>([])
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(50)
    const [total, setTotal] = useState(0)
    const [searchTerm, setSearchTerm] = useState("")
    const [originFilter, setOriginFilter] = useState<string>("")
    const [editingEntry, setEditingEntry] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [editForm, setEditForm] = useState({
        sourceText: "",
        targetText: "",
        notes: ""
    }) 

    // 加载词典条目（分页）
    const loadEntries = async (opts?: { page?: number; pageSize?: number; term?: string }) => {
        try {
            const curPage = opts?.page ?? page
            const curSize = opts?.pageSize ?? pageSize
            const term = opts?.term ?? (searchTerm || "")
            const result = await fetchDictionaryEntriesPagedAction(dictionary.id, curPage, curSize, term, originFilter || undefined)
            if (result.success && result.data) {
                setEntries(result.data.map((entry: any) => ({
                    id: entry.id,
                    sourceText: entry.sourceText,
                    targetText: entry.targetText,
                    notes: entry.notes ?? null,
                    explanation: entry.explanation ?? null,
                    context: entry.context ?? null,
                    createdById: entry.createdById ?? null,
                    updatedById: entry.updatedById ?? null,
                    createdAt: new Date(entry.createdAt as any),
                    updatedAt: new Date(entry.updatedAt as any),
                    dictionaryId: entry.dictionaryId,
                    enabled: entry.enabled === true,
                    origin: entry.origin ?? null
                })))
                setTotal((result as any).total || 0)
                if (opts?.page) setPage(opts.page)
                if (opts?.pageSize) setPageSize(opts.pageSize)
            }
        } catch (error) {
            console.error("加载词典条目失败:", error)
            toast.error("加载词典条目失败")
        }
    }

    // 搜索条目
    const handleSearch = async () => {
        // 搜索重置到第 1 页
        await loadEntries({ page: 1 })
    }

    useEffect(() => {
        void loadEntries({ page: 1, pageSize })
    }, [dictionary.id, reloadToken])

    useEffect(() => {
        const timer = setTimeout(() => {
            void handleSearch()
        }, 300)

        return () => clearTimeout(timer)
    }, [searchTerm, originFilter])

    const handleAddEntry = () => {
        if (dictionary.visibility === 'PUBLIC') return; // 公共词库不允许新增/编辑
        const newEntry: DictionaryEntry = {
            id: `temp-${Date.now()}`,
            sourceText: "",
            targetText: "",
            notes: null,
            explanation: null,
            context: null,
            createdById: null,
            updatedById: null,
            enabled: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            dictionaryId: dictionary.id,
            origin: null as any
        }
        
        setEntries([newEntry, ...entries])
        setEditingEntry(newEntry.id)
        setEditForm({ sourceText: "", targetText: "", notes: "" })
    }

    const handleEditEntry = (entry: DictionaryEntry) => {
        if (dictionary.visibility === 'PUBLIC') return; // 公共词库不可编辑
        setEditingEntry(entry.id)
        setEditForm({
            sourceText: entry.sourceText,
            targetText: entry.targetText,
            notes: entry.notes ?? ""
        })
    }

    const handleSaveEntry = async (entryId: string) => {
        if (dictionary.visibility === 'PUBLIC') return;
        if (!editForm.sourceText.trim() || !editForm.targetText.trim()) {
            toast.error("源语言和目标语言不能为空") 
            return
        }

        setLoading(true)
        try {
            if (entryId.startsWith('temp-')) {
                // 新建条目
                const result = await createDictionaryEntryAction({
                    sourceText: editForm.sourceText,
                    targetText: editForm.targetText,
                    notes: editForm.notes,
                    dictionaryId: dictionary.id
                })

                if (result.success && result.data) {
                    toast.success("词条创建成功！")
                    onEntriesUpdated()
                    await loadEntries()
                } else {
                    toast.error(result.error ?? "创建词条失败")
                }
            } else {
                // 更新现有条目
                const result = await updateDictionaryEntryAction(entryId, {
                    sourceText: editForm.sourceText,
                    targetText: editForm.targetText,
                    notes: editForm.notes
                })

                if (result.success && result.data) {
                    toast.success("词条更新成功！")
                    onEntriesUpdated()
                    await loadEntries()
                } else {
                    toast.error(result.error ?? "更新词条失败")
                }
            }
            
            setEditingEntry(null)
            setEditForm({ sourceText: "", targetText: "", notes: "" })
        } catch (error) {
            console.error("保存词条失败:", error)
            toast.error("保存词条时发生错误")
        } finally {
            setLoading(false)
        }
    }

    const handleCancelEdit = () => {
        setEditingEntry(null)
        setEditForm({ sourceText: "", targetText: "", notes: "" })
        
        // 如果是临时条目，从列表中移除
        setEntries(entries.filter(entry => !entry.id.startsWith('temp-')))
    }

    const handleDeleteEntry = async (entryId: string) => {
        if (dictionary.visibility === 'PUBLIC') return; // 公共词库可删除？按需求仅允许删除词库整体或通过选择删除，保守先禁止
        if (entryId.startsWith('temp-')) {
            setEntries(entries.filter(entry => entry.id !== entryId))
            return
        }

        try {
            const result = await deleteDictionaryEntryAction(entryId)
            if (result.success) {
                toast.success("词条删除成功！")
                onEntriesUpdated()
                await loadEntries()
            } else {
                toast.error(result.error ?? "删除词条失败")
            }
        } catch (error) {
            console.error("删除词条失败:", error)
            toast.error("删除词条时发生错误")
        }
    }

    const handleInputChange = (field: string, value: string) => {
        setEditForm(prev => ({ ...prev, [field]: value }))
    }

    const handleToggleEnabled = async (entry: DictionaryEntry, value: boolean) => {
        if (dictionary.visibility === 'PUBLIC') return
        try {
            setLoading(true)
            const result = await updateDictionaryEntryAction(entry.id, { enabled: value })
            if (result.success) {
                setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, enabled: value } : e))
                toast.success(value ? "已启用词条" : "已禁用词条")
            } else {
                toast.error(result.error ?? "更新状态失败")
            }
        } catch (error) {
            console.error("切换启用状态失败:", error)
            toast.error("切换启用状态时发生错误")
        } finally {
            setLoading(false)
        }
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-lg">管理词典中的术语条目，共 {total} 条（第 {page} / {Math.max(1, Math.ceil(total / Math.max(1, pageSize)))} 页）</CardTitle>
                       
                    </div>
                    <div className="flex space-x-2">
                        <ImportDictionaryEntriesDialog 
                            dictionaryId={dictionary.id}
                            onCompleted={async () => { onEntriesUpdated(); await loadEntries(); }}
                        />
                        <Button onClick={handleAddEntry} size="sm" disabled={loading || dictionary.visibility === 'PUBLIC'} title={dictionary.visibility === 'PUBLIC' ? '公共词库不支持编辑' : undefined}>
                            <Plus className="mr-2 h-4 w-4" />
                            添加词条
                        </Button>
                        {onDictionaryDeleted && (
                            <Button 
                                variant="destructive" 
                                size="sm" 
                                disabled={loading}
                                onClick={async () => {
                                    if (confirm(`确定要删除词库 "${dictionary.name}" 吗？此操作将同时删除该词库中的所有词条，且无法撤销。`)) {
                                        setLoading(true)
                                        try {
                                            const result = await deleteDictionaryAction(dictionary.id)
                                            if (result.success) {
                                                onDictionaryDeleted(dictionary.id)
                                                toast.success("词典删除成功！")
                                            } else {
                                                toast.error(result.error ?? "删除词典失败") 
                                            }
                                        } catch (error) {
                                            console.error("删除词典失败:", error)
                                            toast.error("删除词典时发生错误") 
                                        } finally {
                                            setLoading(false)
                                        }
                                    }
                                }}
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                删除词库
                            </Button>
                        )}
                        {/* <Button 
                            variant="outline" 
                            size="sm" 
                            disabled={loading}
                            onClick={() => {
                                // 这里可以触发编辑词典的对话框
                                // 暂时使用简单的提示
                                alert("编辑词典功能将在词典卡片中提供")
                            }}
                        >
                            <Edit3 className="mr-2 h-4 w-4" />
                            编辑词库
                        </Button> */}
                    </div>
                </div>
                <div className="relative mt-4">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                    <Input
                        type="text"
                        placeholder="搜索词条..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-8"
                        disabled={loading}
                    />
                    <div className="mt-2 flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">来源</span>
                        <select value={originFilter} onChange={(e)=>setOriginFilter(e.target.value)} className="border rounded px-2 py-1 bg-background text-sm">
                            <option value="">全部</option>
                            <option value="manual">手动</option>
                            <option value="import:xlsx">导入·Excel</option>
                            <option value="import:tbx">导入·TBX</option>
                            <option value="apply:new">术语·新建</option>
                            <option value="apply:copied">术语·拷贝</option>
                        </select>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-96">
                    <div className="space-y-3">
                        {entries.map((entry) => (
                            <div key={entry.id} className="border rounded-lg p-4">
                                {editingEntry === entry.id ? (
                                    // 编辑模式
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <Label htmlFor={`source-${entry.id}`}>源语言</Label>
                                                <Input
                                                    id={`source-${entry.id}`}
                                                    value={editForm.sourceText}
                                                    onChange={(e) => handleInputChange("sourceText", e.target.value)}
                                                    placeholder="输入源语言术语"
                                                    disabled={loading}
                                                />
                                            </div>
                                            <div>
                                                <Label htmlFor={`target-${entry.id}`}>目标语言</Label>
                                                <Input
                                                    id={`target-${entry.id}`}
                                                    value={editForm.targetText}
                                                    onChange={(e) => handleInputChange("targetText", e.target.value)}
                                                    placeholder="输入目标语言术语"
                                                    disabled={loading}
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <Label htmlFor={`notes-${entry.id}`}>备注</Label>
                                            <Textarea
                                                id={`notes-${entry.id}`}
                                                value={editForm.notes}
                                                onChange={(e) => handleInputChange("notes", e.target.value)}
                                                placeholder="输入备注说明"
                                                rows={2}
                                                disabled={loading}
                                            />
                                        </div>
                                        <div className="flex justify-end space-x-2">
                                            <Button 
                                                variant="outline" 
                                                size="sm"
                                                onClick={handleCancelEdit}
                                                disabled={loading}
                                            >
                                                取消
                                            </Button>
                                            <Button 
                                                size="sm"
                                                onClick={() => handleSaveEntry(entry.id)}
                                                disabled={loading}
                                            >
                                                {loading ? "保存中..." : "保存"}
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    // 显示模式
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <Label className="text-sm font-medium text-muted-foreground">
                                                        源语言
                                                    </Label>
                                                    <p className="text-sm">{entry.sourceText}</p>
                                                </div>
                                                <div>
                                                    <Label className="text-sm font-medium text-muted-foreground">
                                                        目标语言
                                                    </Label>
                                                    <p className="text-sm">{entry.targetText}</p>
                                                </div>
                                            </div>
                                            <div className="mt-2 grid grid-cols-2 gap-4">
                                               
                                                    <div>
                                                        <Label className="text-sm font-medium text-muted-foreground">
                                                            备注
                                                        </Label>
                                                        <p className="text-sm text-muted-foreground">{entry.notes? entry.notes:'-' }</p>
                                                    </div>
                                                { (entry as any).origin && (
                                                    <div>
                                                        <Label className="text-sm font-medium text-muted-foreground">来源</Label>
                                                        <p className="text-sm text-muted-foreground">{String((entry as any).origin)}</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center space-x-3">
                                            <div className="flex items-center gap-2">
                                                <Label className="text-sm text-muted-foreground">启用</Label>
                                                <Switch
                                                    checked={!!(entry as any).enabled}
                                                    onCheckedChange={(checked) => handleToggleEnabled(entry, !!checked)}
                                                    disabled={loading || dictionary.visibility === 'PUBLIC'}
                                                />
                                            </div>
                                            <div className="flex space-x-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleEditEntry(entry)}
                                                    disabled={loading || dictionary.visibility === 'PUBLIC'}
                                                    title={dictionary.visibility === 'PUBLIC' ? '公共词库不支持编辑' : undefined}
                                                >
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleDeleteEntry(entry.id)}
                                                    className="text-red-500 hover:text-red-700"
                                                    disabled={loading || dictionary.visibility === 'PUBLIC'}
                                                    title={dictionary.visibility === 'PUBLIC' ? '公共词库不支持删除条目' : undefined}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                        
                        {entries.length === 0 && (
                            <div className="text-center py-8 text-muted-foreground">
                                {searchTerm ? "没有找到匹配的词条" : "暂无词条，点击上方按钮添加"}
                            </div>
                        )}
                        
                        {entries.length > 0 && entries.length === 30 && !searchTerm && (
                            <div className="text-center py-4 text-sm text-muted-foreground border-t">
                                仅显示最新的30条词条
                            </div>
                        )}
                        
                        {entries.length > 0 && entries.length === 30 && searchTerm && (
                            <div className="text-center py-4 text-sm text-muted-foreground border-t">
                                搜索结果仅显示前30条匹配项
                            </div>
                        )}
                    </div>
                </ScrollArea>
                <div className="mt-3 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                        <span>每页</span>
                        <select
                            value={pageSize}
                            onChange={async (e) => {
                                const size = parseInt(e.target.value) || 50;
                                await loadEntries({ page: 1, pageSize: size });
                            }}
                            className="border rounded px-2 py-1 bg-background"
                        >
                            <option value={20}>20</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                        </select>
                        <span>条</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page <= 1}
                            onClick={async () => { await loadEntries({ page: Math.max(1, page - 1) }); }}
                        >
                            上一页
                        </Button>
                        <span>
                            第 {page} / {Math.max(1, Math.ceil(total / Math.max(1, pageSize)))} 页
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page >= Math.ceil((total || 0) / Math.max(1, pageSize))}
                            onClick={async () => { await loadEntries({ page: page + 1 }); }}
                        >
                            下一页
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
} 