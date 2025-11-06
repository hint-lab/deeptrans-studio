"use client"

import { useState } from "react"
import { Button } from "src/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "src/components/ui/dialog"
import { Input } from "src/components/ui/input"
import { Label } from "src/components/ui/label"
import { Textarea } from "src/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select"
import { Switch } from "src/components/ui/switch"
import { PlusCircledIcon } from "@radix-ui/react-icons"
type ClientDictionary = {
    id: string
    name: string
    description: string
    domain: string
    visibility: 'PUBLIC' | 'PROJECT' | 'PRIVATE'
    createdAt: Date
    updatedAt: Date
    tenantId: string | null
    projectId: string | null
    userId: string | null
}
import { createDictionaryAction } from "@/actions/dictionary"
import { DOMAINS} from "@/constants/domains"
import { toast } from "sonner"

interface CreateDictionaryDialogProps {
    onDictionaryCreated: (dictionary: ClientDictionary) => void
    userId?: string
}


export function CreateDictionaryDialog({ onDictionaryCreated, userId }: CreateDictionaryDialogProps) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [formData, setFormData] = useState({
        name: "",
        description: "",
        domain: "",
        visibility: 'PRIVATE'
    }) 

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        
        try {
            const result = await createDictionaryAction({
                name: formData.name,
                description: formData.description,
                domain: formData.domain,
                visibility: 'PRIVATE',
                userId: userId
            })
            
            if (result.success && result.data) {
                const newDictionary: ClientDictionary = {
                    id: result.data.id,
                    name: result.data.name,
                    description: result.data.description ?? "",
                    domain: result.data.domain,
                    visibility:  result.data.visibility,
                    createdAt: new Date(result.data.createdAt as any),
                    updatedAt: new Date(result.data.updatedAt as any),
                    tenantId: (result.data as any).tenantId ?? null,
                    projectId: (result.data as any).projectId ?? null,
                    userId: result.data.userId ?? null,
                }
                onDictionaryCreated(newDictionary)
                setFormData({ name: "", description: "", domain: "", visibility: 'PRIVATE' })
                setOpen(false)
                
                toast.success("词典创建成功！")
            } else {
                toast.error(result.error ?? "创建词典失败")
            }
        } catch (error) {
            toast.error("创建词典时发生错误")
        } finally {
            setLoading(false)
        }
    }

    const handleInputChange = (field: string, value: string | boolean) => {
        setFormData(prev => ({ ...prev, [field]: value }))
    }

    // 如果没有用户ID，禁用私有词典创建
    const canCreatePrivate = !!userId

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button>
                    <PlusCircledIcon className="mr-2 h-4 w-4" />
                    增加词库
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>创建新词库</DialogTitle>
                    <DialogDescription>
                        {canCreatePrivate 
                            ? "创建一个新的词典，用于存储专业术语和翻译对照。"
                            : "请先登录以创建词典。"
                        }
                    </DialogDescription>
                </DialogHeader>
                {!canCreatePrivate ? (
                    <div className="py-4 text-center">
                        <p className="text-muted-foreground mb-4">您需要登录才能创建词典</p>
                        <Button asChild>
                            <a href="/auth/login">去登录</a>
                        </Button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit}>
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="name" className="text-right">
                                    名称
                                </Label>
                                <Input
                                    id="name"
                                    value={formData.name}
                                    onChange={(e) => handleInputChange("name", e.target.value)}
                                    placeholder="输入词库名称"
                                    className="col-span-3"
                                    required
                                    disabled={loading}
                                />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="description" className="text-right">
                                    描述
                                </Label>
                                <Textarea
                                    id="description"
                                    value={formData.description}
                                    onChange={(e) => handleInputChange("description", e.target.value)}
                                    placeholder="输入词库描述"
                                    className="col-span-3"
                                    rows={3}
                                    disabled={loading}
                                />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="domain" className="text-right">
                                    领域
                                </Label>
                                <Select
                                    value={formData.domain}
                                    onValueChange={(value) => handleInputChange("domain", value)}
                                    required
                                    disabled={loading}
                                >
                                    <SelectTrigger className="col-span-3">
                                        <SelectValue placeholder="选择领域" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {DOMAINS.map((option) => (
                                            <SelectItem key={option.value} value={option.value}>
                                                {option.labelKey}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="isPublic" className="text-right">
                                    公开
                                </Label>
                                <div className="col-span-3 flex items-center space-x-2">
                                    <Switch
                                        id="isPublic"
                                        checked={formData.visibility === 'PUBLIC'}
                                        onCheckedChange={(checked) => handleInputChange("visibility", checked ? 'PUBLIC' : 'PRIVATE')}
                                        disabled={loading}
                                    />
                                    <Label htmlFor="isPublic">设为公开词库</Label>
                                </div>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                                取消
                            </Button>
                            <Button type="submit" disabled={loading}>
                                {loading ? "创建中..." : "创建词库"}
                            </Button>
                        </DialogFooter>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    )
} 