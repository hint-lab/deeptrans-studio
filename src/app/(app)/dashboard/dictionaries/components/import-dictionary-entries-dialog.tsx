'use client';

import { useState } from 'react';
import { Button } from 'src/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from 'src/components/ui/dialog';
import { Label } from 'src/components/ui/label';
import { Input } from 'src/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from 'src/components/ui/select';
import { toast } from 'sonner';
import { importDictionaryFromFormAction } from '@/actions/dictionary';

interface ImportDictionaryEntriesDialogProps {
    dictionaryId: string;
    onCompleted?: () => Promise<void> | void;
}

export function ImportDictionaryEntriesDialog({
    dictionaryId,
    onCompleted,
}: ImportDictionaryEntriesDialogProps) {
    const [open, setOpen] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [mode, setMode] = useState<'upsert' | 'append' | 'overwrite'>('upsert');
    const [sourceLang, setSourceLang] = useState('');
    const [targetLang, setTargetLang] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!file) {
            toast.error('请先选择文件');
            return;
        }
        const form = new FormData();
        form.append('dictionaryId', dictionaryId);
        form.append('mode', mode);
        form.append('file', file);
        if (sourceLang) form.append('sourceLang', sourceLang);
        if (targetLang) form.append('targetLang', targetLang);

        setSubmitting(true);
        try {
            const data = await importDictionaryFromFormAction(form);
            if (!data?.success) {
                throw new Error((data as any)?.error || '导入失败');
            }
            toast.success(
                `导入完成: 总计 ${data.data?.total}，新增 ${data.data?.inserted}，更新 ${data.data?.updated}`
            );
            setOpen(false);
            setFile(null);
            if (onCompleted) await onCompleted();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : '导入失败');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="secondary" size="sm">
                    导入词条
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>导入词条（Excel/TBX）</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label>选择文件</Label>
                        <Input
                            type="file"
                            accept=".xlsx,.xls,.csv,.tbx"
                            onChange={e =>
                                setFile(
                                    e.target.files && e.target.files[0] ? e.target.files[0] : null
                                )
                            }
                        />
                        <p className="text-xs text-muted-foreground">
                            支持 .xlsx/.xls/.csv/.tbx，建议表头包含 source/target/notes
                        </p>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-2">
                            <Label>导入模式</Label>
                            <Select value={mode} onValueChange={v => setMode(v as any)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="选择导入模式" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="upsert">智能合并</SelectItem>
                                    <SelectItem value="append">仅追加</SelectItem>
                                    <SelectItem value="overwrite">覆盖</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>TBX 源语言（可选）</Label>
                            <Input
                                placeholder="如 en, zh, ja"
                                value={sourceLang}
                                onChange={e => setSourceLang(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>TBX 目标语言（可选）</Label>
                            <Input
                                placeholder="如 zh, en"
                                value={targetLang}
                                onChange={e => setTargetLang(e.target.value)}
                            />
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
                        取消
                    </Button>
                    <Button onClick={handleSubmit} disabled={submitting || !file}>
                        {submitting ? '导入中...' : '开始导入'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
