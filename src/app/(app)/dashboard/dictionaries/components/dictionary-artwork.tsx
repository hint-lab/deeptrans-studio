'use client';

import {
    BookOpenText,
    BriefcaseBusiness,
    Cpu,
    Edit3,
    GraduationCap,
    Landmark,
    Scale,
    Stethoscope,
    Trash2,
    Wrench,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from 'src/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from 'src/components/ui/dialog';
import { Input } from 'src/components/ui/input';
import { Label } from 'src/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from 'src/components/ui/select';
import { Textarea } from 'src/components/ui/textarea';

import { deleteDictionaryAction, updateDictionaryAction } from '@/actions/dictionary';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { createLogger } from '@/lib/logger';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { cn } from 'src/lib/utils';

// 定义Dictionary接口
interface Dictionary {
    id: string;
    name: string;
    description?: string;
    domain: string;
    visibility?: 'PUBLIC' | 'PROJECT' | 'PRIVATE';
    isPublic?: boolean;
    entryCount?: number;
    canWrite?: boolean;
    // 其他可选属性
}
const logger = createLogger(
    {
        type: 'dictionary:dictionary-artwork',
    },
    {
        json: false, // 开启json格式输出
        pretty: false, // 关闭开发环境美化输出
        colors: true, // 仅当json：false时启用颜色输出可用
        includeCaller: false, // 日志不包含调用者
    }
);
// 导出Dictionary类型供其他文件使用
export type { Dictionary };

interface DictionaryArtworkProps extends React.HTMLAttributes<HTMLDivElement> {
    dictionary: Dictionary;
    onClick?: () => void;
    onDelete?: (dictionaryId: string) => void;
    onEdit?: (dictionaryId: string, updatedData: Partial<Dictionary>) => void;
    showDeleteButton?: boolean;
    showEditButton?: boolean;
}

export function DictionaryArtwork({
    dictionary,
    className,
    onClick,
    onDelete,
    onEdit,
    showDeleteButton = false,
    showEditButton = false,
    ...props
}: DictionaryArtworkProps) {
    const t = useTranslations('Dashboard.Dictionaries');
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [showEditDialog, setShowEditDialog] = useState(false);
    const [editForm, setEditForm] = useState({
        name: dictionary.name,
        description: dictionary.description ?? '',
        domain: dictionary.domain,
    });
    const [loading, setLoading] = useState(false);
    const domainIcons = {
        technology: Cpu,
        legal: Scale,
        medical: Stethoscope,
        finance: Landmark,
        marketing: BriefcaseBusiness,
        engineering: Wrench,
        education: GraduationCap,
        'artificial-intelligence': Cpu,
    } as const;
    const DomainIcon = domainIcons[dictionary.domain as keyof typeof domainIcons] ?? BookOpenText;

    const handleDelete = () => {
        setShowDeleteDialog(true);
    };

    const handleEdit = () => {
        setEditForm({
            name: dictionary.name,
            description: dictionary.description ?? '',
            domain: dictionary.domain,
        });
        setShowEditDialog(true);
    };

    const confirmDelete = async () => {
        setLoading(true);
        try {
            // 先调用API删除词典
            const result = await deleteDictionaryAction(dictionary.id);

            if (result.success) {
                // 删除成功后，调用父组件的回调函数更新UI状态
                if (onDelete) {
                    onDelete(dictionary.id);
                }
                logger.info('词典删除成功！');
                toast.success('词典删除成功！');
            } else {
                toast.error(result.error ?? '删除词典失败');
            }
        } catch (error) {
            logger.error('删除词典失败:', error);
            toast.error('删除词典时发生错误');
        } finally {
            setLoading(false);
            setShowDeleteDialog(false);
        }
    };

    const confirmEdit = async () => {
        if (!editForm.name.trim()) {
            logger.warn('词典删除成功！');
            toast.error('词库名称不能为空');
            return;
        }

        setLoading(true);
        try {
            const result = await updateDictionaryAction(dictionary.id, {
                name: editForm.name.trim(),
                description: editForm.description.trim() || undefined,
                domain: editForm.domain,
            });

            if (result.success && result.data) {
                logger.info('词典信息更新成功！');
                toast.success('词典信息更新成功！');

                // 调用父组件的回调函数
                if (onEdit) {
                    onEdit(dictionary.id, {
                        name: editForm.name.trim(),
                        description: editForm.description.trim() || undefined,
                        domain: editForm.domain,
                    });
                }

                setShowEditDialog(false);
            } else {
                logger.error('更新词典失败:', result.error);
                toast.error(result.error ?? '更新词典失败');
            }
        } catch (error) {
            logger.error('更新词典失败:', error);
            toast.error('更新词典时发生错误');
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (field: string, value: string) => {
        setEditForm(prev => ({
            ...prev,
            [field]: value,
        }));
    };

    return (
        <>
            <div className={cn('h-full', className)} {...props}>
                <ContextMenu>
                    <ContextMenuTrigger asChild>
                        <div
                            role="button"
                            tabIndex={0}
                            className="group relative flex min-h-[116px] cursor-pointer gap-3 rounded-lg border bg-card p-4 pr-12 text-left transition-colors hover:border-muted-foreground/30 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={onClick}
                            onKeyDown={event => {
                                if (event.target !== event.currentTarget) return;
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    onClick?.();
                                }
                            }}
                        >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-muted/50">
                                <DomainIcon className="h-5 w-5 text-muted-foreground" />
                            </div>

                            <div className="min-w-0 flex-1">
                                <h3 className="truncate text-sm font-semibold text-foreground">
                                    {dictionary.name}
                                </h3>
                                <p className="mt-1 line-clamp-2 min-h-8 text-xs leading-4 text-muted-foreground">
                                    {dictionary.description || dictionary.domain}
                                </p>
                                <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                                    <span className="rounded border bg-background px-1.5 py-0.5">
                                        {dictionary.domain}
                                    </span>
                                    {dictionary.entryCount !== undefined && (
                                        <span>
                                            {t('total')} {dictionary.entryCount.toLocaleString()}{' '}
                                            {t('entries')}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="absolute right-3 top-3 flex items-center gap-1 opacity-60 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                                {showEditButton && onEdit && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        aria-label="编辑词库"
                                        onClick={e => {
                                            e.stopPropagation();
                                            handleEdit();
                                        }}
                                    >
                                        <Edit3 className="h-3.5 w-3.5" />
                                    </Button>
                                )}

                                {showDeleteButton && onDelete && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                        aria-label="删除词库"
                                        onClick={e => {
                                            e.stopPropagation();
                                            handleDelete();
                                        }}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                )}
                            </div>
                        </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-40">
                        <ContextMenuItem onClick={onClick}>查看词条</ContextMenuItem>
                        {showEditButton && onEdit && (
                            <>
                                <ContextMenuSeparator />
                                <ContextMenuItem onClick={handleEdit}>
                                    <Edit3 size={16} className="mr-2" />
                                    编辑词库
                                </ContextMenuItem>
                            </>
                        )}
                        {showDeleteButton && onDelete && (
                            <>
                                <ContextMenuSeparator />
                                <ContextMenuItem
                                    onClick={handleDelete}
                                    className="text-red-600 focus:text-red-600"
                                >
                                    <Trash2 size={16} className="mr-2" />
                                    删除词库
                                </ContextMenuItem>
                            </>
                        )}
                    </ContextMenuContent>
                </ContextMenu>
            </div>

            {/* 删除确认对话框 */}
            <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>确认删除</DialogTitle>
                        <DialogDescription>
                            您确定要删除词库 &ldquo;{dictionary.name}&rdquo;
                            吗？此操作将同时删除该词库中的所有词条，且无法撤销。
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowDeleteDialog(false)}
                            disabled={loading}
                        >
                            取消
                        </Button>
                        <Button variant="destructive" onClick={confirmDelete} disabled={loading}>
                            {loading ? '删除中...' : '删除'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 编辑对话框 */}
            <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>编辑词库</DialogTitle>
                        <DialogDescription>
                            修改词库的基本信息。点击保存以应用更改。
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="name" className="text-right">
                                名称
                            </Label>
                            <Input
                                id="name"
                                value={editForm.name}
                                onChange={e => handleInputChange('name', e.target.value)}
                                className="col-span-3"
                                placeholder="输入词库名称"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="description" className="text-right">
                                介绍
                            </Label>
                            <Textarea
                                id="description"
                                value={editForm.description}
                                onChange={e => handleInputChange('description', e.target.value)}
                                className="col-span-3"
                                placeholder="输入词库介绍"
                                rows={3}
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="domain" className="text-right">
                                领域
                            </Label>
                            <Select
                                value={editForm.domain}
                                onValueChange={value => handleInputChange('domain', value)}
                            >
                                <SelectTrigger className="col-span-3">
                                    <SelectValue placeholder="选择领域" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="general">通用</SelectItem>
                                    <SelectItem value="technology">技术</SelectItem>
                                    <SelectItem value="legal">法律</SelectItem>
                                    <SelectItem value="medical">医疗</SelectItem>
                                    <SelectItem value="finance">金融</SelectItem>
                                    <SelectItem value="artificial-intelligence">
                                        人工智能
                                    </SelectItem>
                                    <SelectItem value="marketing">营销</SelectItem>
                                    <SelectItem value="engineering">工程</SelectItem>
                                    <SelectItem value="education">教育</SelectItem>
                                    <SelectItem value="custom">自定义</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                            取消
                        </Button>
                        <Button onClick={confirmEdit} disabled={loading || !editForm.name.trim()}>
                            {loading ? '保存中...' : '保存'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
