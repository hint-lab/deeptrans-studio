'use client';

import { Edit3, PlusIcon, Trash2 } from 'lucide-react';
import Image from 'next/image';
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
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger,
    ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { createLogger } from '@/lib/logger';
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
    cover?: string; // 添加封面图片
    entryCount?: number;
    // 其他可选属性
}
const logger = createLogger({
    type: 'dictionary:dictionary-artwork',
}, {
    json: false,// 开启json格式输出
    pretty: false, // 关闭开发环境美化输出
    colors: true, // 仅当json：false时启用颜色输出可用
    includeCaller: false, // 日志不包含调用者
});
// 导出Dictionary类型供其他文件使用
export type { Dictionary };

interface DictionaryArtworkProps extends React.HTMLAttributes<HTMLDivElement> {
    dictionary: Dictionary;
    aspectRatio?: 'portrait' | 'square';
    width?: number;
    height?: number;
    onClick?: () => void;
    onDelete?: (dictionaryId: string) => void;
    onEdit?: (dictionaryId: string, updatedData: Partial<Dictionary>) => void;
    showDeleteButton?: boolean;
    showEditButton?: boolean;
}

export function DictionaryArtwork({
    dictionary,
    aspectRatio = 'portrait',
    width,
    height,
    className,
    onClick,
    onDelete,
    onEdit,
    showDeleteButton = false,
    showEditButton = false,
    ...props
}: DictionaryArtworkProps) {
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [showEditDialog, setShowEditDialog] = useState(false);
    const [editForm, setEditForm] = useState({
        name: dictionary.name,
        description: dictionary.description ?? '',
        domain: dictionary.domain,
    });
    const [loading, setLoading] = useState(false);

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
                logger.info('词典删除成功！')
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
            logger.warn('词典删除成功！')
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
                logger.info('词典信息更新成功！')
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
            <div className={cn('space-y-3', className)} {...props}>
                <ContextMenu>
                    <ContextMenuTrigger>
                        <div className="group relative">
                            <div
                                className="cursor-pointer overflow-hidden rounded-lg transition-all duration-200 hover:scale-105 hover:shadow-lg"
                                onClick={onClick}
                            >
                                <div
                                    className={cn(
                                        'relative flex items-center justify-center border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100',
                                        aspectRatio === 'portrait'
                                            ? 'aspect-[3/4]'
                                            : 'aspect-square'
                                    )}
                                >
                                    {dictionary.cover ? (
                                        <Image
                                            src={dictionary.cover}
                                            alt={dictionary.name}
                                            fill
                                            className="object-cover"
                                            sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 20vw"
                                            priority={dictionary.cover === '/images/dictionaries/legal.svg'}
                                        />
                                    ) : (
                                        <div className="p-4 text-center">
                                            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-slate-200">
                                                <span className="text-2xl text-slate-500">📚</span>
                                            </div>
                                            <h4 className="mb-1 line-clamp-2 text-sm font-semibold text-slate-700">
                                                {dictionary.name}
                                            </h4>
                                            <p className="text-xs text-slate-500">
                                                {dictionary.domain}
                                            </p>
                                        </div>
                                    )}

                                    {/* 条目数量徽章 */}
                                    {dictionary.entryCount !== undefined && (
                                        <div className="absolute left-2 top-2 rounded-full bg-blue-500 px-2 py-1 text-xs font-medium text-white">
                                            {dictionary.entryCount}
                                        </div>
                                    )}

                                    {/* 领域标签 */}
                                    <div className="absolute bottom-2 left-2 rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-slate-700 backdrop-blur-sm">
                                        {dictionary.domain}
                                    </div>
                                </div>
                            </div>

                            {/* 操作按钮组 */}
                            <div className="absolute right-2 top-2 flex space-x-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                                {/* 编辑按钮 */}
                                {showEditButton && onEdit && (
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        className="h-7 w-7 rounded-full p-0 shadow-lg hover:bg-slate-200"
                                        onClick={e => {
                                            e.stopPropagation();
                                            handleEdit();
                                        }}
                                    >
                                        <Edit3 className="h-3 w-3" />
                                    </Button>
                                )}

                                {/* 删除按钮 */}
                                {showDeleteButton && onDelete && (
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        className="h-7 w-7 rounded-full p-0 shadow-lg hover:bg-red-700"
                                        onClick={e => {
                                            e.stopPropagation();
                                            handleDelete();
                                        }}
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </Button>
                                )}
                            </div>
                        </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-40">
                        <ContextMenuItem onClick={onClick}>查看词条</ContextMenuItem>
                        <ContextMenuItem>添加到我的词库</ContextMenuItem>
                        <ContextMenuSub>
                            <ContextMenuSubTrigger>添加到项目</ContextMenuSubTrigger>
                            <ContextMenuSubContent className="w-48">
                                <ContextMenuItem>
                                    <PlusIcon size={16} />
                                    新建项目
                                </ContextMenuItem>
                                <ContextMenuSeparator />
                            </ContextMenuSubContent>
                        </ContextMenuSub>
                        <ContextMenuSeparator />
                        <ContextMenuItem>查看详情</ContextMenuItem>
                        <ContextMenuItem>复制</ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem>收藏</ContextMenuItem>
                        <ContextMenuItem>分享</ContextMenuItem>
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
                <div className="space-y-1 text-sm">
                    <h3 className="line-clamp-2 font-medium leading-none">{dictionary.name}</h3>
                    <p className="line-clamp-1 text-xs text-muted-foreground">
                        {dictionary.description ?? dictionary.domain}
                    </p>
                </div>
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
