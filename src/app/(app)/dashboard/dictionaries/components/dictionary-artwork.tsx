'use client';

import {
    BookOpenText,
    BriefcaseBusiness,
    Cpu,
    Edit3,
    GraduationCap,
    Landmark,
    LockKeyhole,
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

const domainAccents: Record<string, string> = {
    technology: '#3157D5',
    legal: '#7C3AED',
    medical: '#0F766E',
    finance: '#B45309',
    marketing: '#BE185D',
    engineering: '#0369A1',
    education: '#4D7C0F',
    'artificial-intelligence': '#3157D5',
    general: '#475569',
    custom: '#475569',
};

const domainTranslationKeys: Record<string, string> = {
    'artificial-intelligence': 'ai',
};

const supportedDomainTranslationKeys = new Set([
    'general',
    'technology',
    'legal',
    'medical',
    'finance',
    'ai',
    'marketing',
    'engineering',
    'education',
    'custom',
]);

function getEntryScale(entryCount: number) {
    if (entryCount <= 0) return 12;
    return Math.min(100, Math.max(18, Math.round(Math.log10(entryCount + 1) * 32)));
}

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
    const DomainIcon = domainIcons[dictionary.domain as keyof typeof domainIcons] ?? BookOpenText;
    const domainAccent = domainAccents[dictionary.domain] ?? domainAccents.general;
    const domainTranslationKey = domainTranslationKeys[dictionary.domain] ?? dictionary.domain;
    const domainLabel = t(
        `domains.${supportedDomainTranslationKeys.has(domainTranslationKey) ? domainTranslationKey : 'custom'}`
    );
    const entryCount = dictionary.entryCount ?? 0;
    const isReadOnlyProjectDictionary =
        dictionary.visibility === 'PROJECT' && dictionary.canWrite === false;
    const hasInlineActions = Boolean((showEditButton && onEdit) || (showDeleteButton && onDelete));
    const fieldIds = {
        name: `dictionary-${dictionary.id}-name`,
        description: `dictionary-${dictionary.id}-description`,
        domain: `dictionary-${dictionary.id}-domain`,
    };
    const dictionaryAriaLabel = [
        dictionary.name,
        domainLabel,
        `${t('total')} ${entryCount.toLocaleString()} ${t('entries')}`,
        isReadOnlyProjectDictionary ? t('readOnlyDictionary') : null,
    ]
        .filter(Boolean)
        .join(', ');

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
                logger.info(t('deleteSuccess'));
                toast.success(t('deleteSuccess'));
            } else {
                toast.error(result.error ?? t('DeleteDialog.deleteFailed'));
            }
        } catch (error) {
            logger.error(t('DeleteDialog.deleteFailed'), error);
            toast.error(t('DeleteDialog.deleteError'));
        } finally {
            setLoading(false);
            setShowDeleteDialog(false);
        }
    };

    const confirmEdit = async () => {
        if (!editForm.name.trim()) {
            logger.warn(t('EditDialog.nameRequired'));
            toast.error(t('EditDialog.nameRequired'));
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
                logger.info(t('EditDialog.success'));
                toast.success(t('EditDialog.success'));

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
                logger.error(t('EditDialog.updateFailed'), result.error);
                toast.error(result.error ?? t('EditDialog.updateFailed'));
            }
        } catch (error) {
            logger.error(t('EditDialog.updateFailed'), error);
            toast.error(t('EditDialog.updateError'));
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
                            className={cn(
                                'group relative flex h-[96px] gap-3 rounded-md border border-l-[3px] bg-card p-3 text-left shadow-sm transition-[border-color,background-color,box-shadow] hover:border-muted-foreground/35 hover:bg-muted/25 hover:shadow-md',
                                onClick && 'cursor-pointer',
                                hasInlineActions && 'pr-12'
                            )}
                            style={{ borderLeftColor: domainAccent }}
                        >
                            {onClick && (
                                <button
                                    type="button"
                                    aria-label={dictionaryAriaLabel}
                                    className="absolute inset-0 z-0 rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    onClick={onClick}
                                />
                            )}

                            <div
                                className="pointer-events-none relative z-10 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-muted/40"
                                style={{ color: domainAccent }}
                            >
                                <DomainIcon className="h-4 w-4" aria-hidden="true" />
                            </div>

                            <div className="pointer-events-none relative z-10 min-w-0 flex-1 py-0.5">
                                <div className="flex min-w-0 items-center gap-2">
                                    <h3 className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-4 text-foreground">
                                        {dictionary.name}
                                    </h3>
                                    <span className="max-w-20 shrink-0 truncate rounded-sm border bg-background px-1 py-0.5 text-[10px] leading-3 text-muted-foreground sm:max-w-28">
                                        {domainLabel}
                                    </span>
                                </div>
                                <p className="mt-1 line-clamp-1 min-h-4 text-[11px] leading-4 text-muted-foreground">
                                    {dictionary.description || domainLabel}
                                </p>
                                <div className="mt-2 flex items-center gap-2 text-[10px] leading-3 text-muted-foreground">
                                    <span className="shrink-0 font-mono tabular-nums">
                                        {t('total')} {entryCount.toLocaleString()} {t('entries')}
                                    </span>
                                    {isReadOnlyProjectDictionary && (
                                        <span
                                            className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center text-muted-foreground"
                                            title={t('readOnlyDictionary')}
                                        >
                                            <LockKeyhole className="h-3 w-3" aria-hidden="true" />
                                        </span>
                                    )}
                                    <span
                                        className="h-1 w-12 overflow-hidden rounded-full bg-muted"
                                        aria-hidden="true"
                                    >
                                        <span
                                            className="block h-full rounded-full"
                                            style={{
                                                backgroundColor: domainAccent,
                                                width: `${getEntryScale(entryCount)}%`,
                                            }}
                                        />
                                    </span>
                                </div>
                            </div>

                            <div className="absolute right-2 top-2 z-10 flex items-center gap-0.5 opacity-60 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                                {showEditButton && onEdit && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        aria-label={t('editDictionary')}
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
                                        className="h-6 w-6 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                        aria-label={t('deleteDictionary')}
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
                        <ContextMenuItem onClick={onClick} disabled={!onClick}>
                            {t('viewEntries')}
                        </ContextMenuItem>
                        {showEditButton && onEdit && (
                            <>
                                <ContextMenuSeparator />
                                <ContextMenuItem onClick={handleEdit}>
                                    <Edit3 size={16} className="mr-2" />
                                    {t('editDictionary')}
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
                                    {t('deleteDictionary')}
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
                        <DialogTitle>{t('DeleteDialog.title')}</DialogTitle>
                        <DialogDescription>
                            {t('DeleteDialog.description', {
                                name: dictionary.name,
                                count: entryCount.toLocaleString(),
                            })}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowDeleteDialog(false)}
                            disabled={loading}
                        >
                            {t('DeleteDialog.cancel')}
                        </Button>
                        <Button variant="destructive" onClick={confirmDelete} disabled={loading}>
                            {loading ? t('DeleteDialog.deleting') : t('DeleteDialog.confirm')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 编辑对话框 */}
            <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>{t('EditDialog.title')}</DialogTitle>
                        <DialogDescription>{t('EditDialog.desc')}</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor={fieldIds.name} className="text-right">
                                {t('EditDialog.name')}
                            </Label>
                            <Input
                                id={fieldIds.name}
                                value={editForm.name}
                                onChange={e => handleInputChange('name', e.target.value)}
                                className="col-span-3"
                                placeholder={t('EditDialog.namePlaceholder')}
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor={fieldIds.description} className="text-right">
                                {t('EditDialog.description')}
                            </Label>
                            <Textarea
                                id={fieldIds.description}
                                value={editForm.description}
                                onChange={e => handleInputChange('description', e.target.value)}
                                className="col-span-3"
                                placeholder={t('EditDialog.descriptionPlaceholder')}
                                rows={3}
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor={fieldIds.domain} className="text-right">
                                {t('EditDialog.domain')}
                            </Label>
                            <Select
                                value={editForm.domain}
                                onValueChange={value => handleInputChange('domain', value)}
                            >
                                <SelectTrigger id={fieldIds.domain} className="col-span-3">
                                    <SelectValue placeholder={t('EditDialog.selectDomain')} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="general">{t('domains.general')}</SelectItem>
                                    <SelectItem value="technology">
                                        {t('domains.technology')}
                                    </SelectItem>
                                    <SelectItem value="legal">{t('domains.legal')}</SelectItem>
                                    <SelectItem value="medical">{t('domains.medical')}</SelectItem>
                                    <SelectItem value="finance">{t('domains.finance')}</SelectItem>
                                    <SelectItem value="artificial-intelligence">
                                        {t('domains.ai')}
                                    </SelectItem>
                                    <SelectItem value="marketing">
                                        {t('domains.marketing')}
                                    </SelectItem>
                                    <SelectItem value="engineering">
                                        {t('domains.engineering')}
                                    </SelectItem>
                                    <SelectItem value="education">
                                        {t('domains.education')}
                                    </SelectItem>
                                    <SelectItem value="custom">{t('domains.custom')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                            {t('EditDialog.cancel')}
                        </Button>
                        <Button onClick={confirmEdit} disabled={loading || !editForm.name.trim()}>
                            {loading ? t('EditDialog.saving') : t('EditDialog.save')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
