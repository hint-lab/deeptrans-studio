"use client"

import { useState } from "react"
import { Button } from "src/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "src/components/ui/dialog"
import { Input } from "src/components/ui/input"
import { Label } from "src/components/ui/label"
import { Textarea } from "src/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select"
import { Edit3 } from "lucide-react"
import { updateDictionaryAction } from "@/actions/dictionary"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Dictionary } from "./dictionary-artwork"

interface EditDictionaryDialogProps {
    dictionary: Dictionary
    onDictionaryEdited: (dictionaryId: string, updatedData: Partial<Dictionary>) => void
}

export function EditDictionaryDialog({ dictionary, onDictionaryEdited }: EditDictionaryDialogProps) {
    const t = useTranslations('Dictionaries.EditDialog')
    const tDomains = useTranslations('Common.domains')
    const [open, setOpen] = useState(false)
    const [editForm, setEditForm] = useState({
        name: dictionary.name,
        description: dictionary.description ?? "",
        domain: dictionary.domain
    })
    const [loading, setLoading] = useState(false)
    const handleOpen = () => {
        setEditForm({
            name: dictionary.name,
            description: dictionary.description ?? "",
            domain: dictionary.domain
        })
        setOpen(true)
    }

    const handleInputChange = (field: string, value: string) => {
        setEditForm(prev => ({
            ...prev,
            [field]: value
        }))
    }

    const handleSave = async () => {
        if (!editForm.name.trim()) {
            toast.error(t('nameRequired'), { description: t('error') as string })
            return
        }

        setLoading(true)
        try {
            const result = await updateDictionaryAction(dictionary.id, {
                name: editForm.name.trim(),
                description: editForm.description.trim() || undefined,
                domain: editForm.domain
            })

            if (result.success && result.data) {
                toast.success(t('success'), { description: t('success') as string })

                // 调用父组件的回调函数
                onDictionaryEdited(dictionary.id, {
                    name: editForm.name.trim(),
                    description: editForm.description.trim() || undefined,
                    domain: editForm.domain
                })

                setOpen(false)
            } else {
                toast.error(result.error ?? t('updateFailed'), { description: t('error') as string })
            }
        } catch (error) {
            console.error("更新词典失败:", error)
            toast.error(t('updateError'), { description: t('error') as string })
        } finally {
            setLoading(false)
        }
    }

    return (
        <>
            <Button variant="outline" onClick={handleOpen} size="sm">
                <Edit3 className="mr-2 h-4 w-4" />
                {t('open')}
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>{t('title')}</DialogTitle>
                        <DialogDescription>
                            {t('desc')}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="name" className="text-right">
                                {t('name')}
                            </Label>
                            <Input
                                id="name"
                                value={editForm.name}
                                onChange={(e) => handleInputChange("name", e.target.value)}
                                className="col-span-3"
                                placeholder={t('namePlaceholder')}
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="description" className="text-right">
                                {t('description')}
                            </Label>
                            <Textarea
                                id="description"
                                value={editForm.description}
                                onChange={(e) => handleInputChange("description", e.target.value)}
                                className="col-span-3"
                                placeholder={t('descriptionPlaceholder')}
                                rows={3}
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="domain" className="text-right">
                                {t('domain')}
                            </Label>
                            <Select value={editForm.domain} onValueChange={(value) => handleInputChange("domain", value)}>
                                <SelectTrigger className="col-span-3">
                                    <SelectValue placeholder={t('selectDomain')} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="general">{tDomains('general')}</SelectItem>
                                    <SelectItem value="technology">{tDomains('technology')}</SelectItem>
                                    <SelectItem value="legal">{tDomains('legal')}</SelectItem>
                                    <SelectItem value="medical">{tDomains('medical')}</SelectItem>
                                    <SelectItem value="finance">{tDomains('finance')}</SelectItem>
                                    <SelectItem value="ai">{tDomains('ai')}</SelectItem>
                                    <SelectItem value="marketing">{tDomains('marketing')}</SelectItem>
                                    <SelectItem value="engineering">{tDomains('engineering')}</SelectItem>
                                    <SelectItem value="education">{tDomains('education')}</SelectItem>
                                    <SelectItem value="custom">{tDomains('custom')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                            {t('cancel')}
                        </Button>
                        <Button onClick={handleSave} disabled={loading || !editForm.name.trim()}>
                            {loading ? t('saving') : t('save')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
} 