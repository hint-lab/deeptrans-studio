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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select"
import { PlusCircledIcon } from "@radix-ui/react-icons"
import { createDictionaryAction } from "@/actions/dictionary"
import { toast } from "sonner"
import { DOMAINS, getDomainOptions } from "@/constants/domains"
import { useTranslations } from "next-intl"

type PublicDictionary = {
    id: string
    name: string
    description: string
    domain: string
    isPublic: boolean
    createdAt: string
    updatedAt: string
    entryCount: number
    cover: string
}

interface AddPublicDictionaryDialogProps {
    onDictionaryAdded: (dictionary: PublicDictionary) => void
    userId?: string
}


export function AddPublicDictionaryDialog({ onDictionaryAdded, userId }: AddPublicDictionaryDialogProps) {
    const tDomains = useTranslations('Common.domains')
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [formData, setFormData] = useState({
        name: "",
        description: "",
        domain: "",
        isPublic: false
    }) 

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            const result = await createDictionaryAction({
                name: formData.name,
                description: formData.description,
                domain: formData.domain,
                visibility: 'PUBLIC',
                userId: undefined
            })

            if (result.success && result.data) {
                const newDictionary: PublicDictionary = {
                    id: result.data.id,
                    name: result.data.name,
                    description: result.data.description ?? "",
                    domain: result.data.domain,
                    isPublic: true,
                    createdAt: result.data.createdAt.toISOString(),
                    updatedAt: result.data.updatedAt.toISOString(),
                    entryCount: 0,
                    cover: "/images/dictionaries/default.svg"
                }

                onDictionaryAdded(newDictionary)
                setFormData({ name: "", description: "", domain: "", isPublic: false })
                setOpen(false)

                toast.success("词典创建成功！")
            } else {
                toast.error(result.error ?? "创建词典失败")
            }       
        } catch (error) {
            console.error("创建词典时出错:", error)
            toast.error("创建词典时发生错误", { description: "创建词典时发生错误" as string })
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
                                        {getDomainOptions((k) => tDomains(k)).map((option) => (
                                            <SelectItem key={option.value} value={option.value}>
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
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