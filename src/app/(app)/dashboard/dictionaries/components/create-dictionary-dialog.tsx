'use client';

import { createDictionaryAction } from '@/actions/dictionary';
import { getDomainOptions } from '@/constants/domains';
import {
    DICTIONARY_CREATE_ERROR_CODES,
    DICTIONARY_CREATE_LIMITS,
    type DictionaryCreateErrorCode,
    dictionaryCreateErrorField,
    dictionaryCreateErrorTranslationKey,
    validateDictionaryCreateInput,
} from '@/lib/dictionary-create-input';
import { PlusCircledIcon } from '@radix-ui/react-icons';
import { useTranslations } from 'next-intl';
import { useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from 'src/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
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

type ClientDictionary = {
    id: string;
    name: string;
    description: string;
    domain: string;
    visibility: 'PUBLIC' | 'PROJECT' | 'PRIVATE';
    createdAt: Date;
    updatedAt: Date;
    tenantId: string | null;
    projectId: string | null;
    userId: string | null;
    canWrite: boolean;
};

type CreateFormData = {
    name: string;
    description: string;
    domain: string;
};

const EMPTY_FORM_DATA: CreateFormData = {
    name: '',
    description: '',
    domain: '',
};

interface CreateDictionaryDialogProps {
    onDictionaryCreated: (dictionary: ClientDictionary) => void;
    userId?: string;
    visibility?: 'PRIVATE' | 'PROJECT';
}

export function CreateDictionaryDialog({
    onDictionaryCreated,
    userId,
    visibility = 'PRIVATE',
}: CreateDictionaryDialogProps) {
    const t = useTranslations('Dashboard.Dictionaries');
    const tDomains = useTranslations('Common.domains');
    const formId = useId();
    const nameId = `${formId}-name`;
    const descriptionId = `${formId}-description`;
    const domainId = `${formId}-domain`;
    const errorId = `${formId}-error`;
    const nameInputRef = useRef<HTMLInputElement>(null);
    const descriptionInputRef = useRef<HTMLTextAreaElement>(null);
    const domainTriggerRef = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formError, setFormError] = useState<DictionaryCreateErrorCode | null>(null);
    const [formData, setFormData] = useState<CreateFormData>(EMPTY_FORM_DATA);

    const resetDialog = () => {
        setFormData(EMPTY_FORM_DATA);
        setFormError(null);
        setIsSubmitting(false);
    };

    const closeDialog = () => {
        setOpen(false);
        resetDialog();
    };

    const handleOpenChange = (nextOpen: boolean) => {
        // A server action cannot be cancelled safely once submitted. Keep the
        // dialog open while it commits, then always reopen from a clean state.
        if (!nextOpen && isSubmitting) return;
        setOpen(nextOpen);
        resetDialog();
    };

    const focusInvalidField = (errorCode: DictionaryCreateErrorCode) => {
        const field = dictionaryCreateErrorField(errorCode);
        requestAnimationFrame(() => {
            if (field === 'name') nameInputRef.current?.focus();
            if (field === 'description') descriptionInputRef.current?.focus();
            if (field === 'domain') domainTriggerRef.current?.focus();
        });
    };

    const showError = (errorCode: DictionaryCreateErrorCode) => {
        setFormError(errorCode);
        focusInvalidField(errorCode);
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (isSubmitting) return;

        const validation = validateDictionaryCreateInput({ ...formData, visibility });
        if (!validation.ok) {
            showError(validation.errorCode);
            return;
        }

        setFormError(null);
        setIsSubmitting(true);

        try {
            const result = await createDictionaryAction(validation.data);
            if (!result.success || !result.data) {
                showError(result.errorCode);
                return;
            }

            onDictionaryCreated({
                id: result.data.id,
                name: result.data.name,
                description: result.data.description ?? '',
                domain: result.data.domain,
                visibility: result.data.visibility,
                createdAt: new Date(result.data.createdAt),
                updatedAt: new Date(result.data.updatedAt),
                tenantId: result.data.tenantId ?? null,
                projectId: null,
                userId: result.data.userId ?? null,
                canWrite: true,
            });
            toast.success(t('CreateDialog.created'));
            closeDialog();
        } catch {
            showError(DICTIONARY_CREATE_ERROR_CODES.CREATE_FAILED);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleInputChange = (field: keyof CreateFormData, value: string) => {
        setFormData(current => ({ ...current, [field]: value }));
        if (formError) setFormError(null);
    };

    const errorMessage = formError ? t(dictionaryCreateErrorTranslationKey(formError)) : undefined;
    const errorField = dictionaryCreateErrorField(formError);
    const canCreate = Boolean(userId);

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button>
                    <PlusCircledIcon className="mr-2 h-4 w-4" />
                    {t('addDictionary')}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{t('createNewDictionary')}</DialogTitle>
                    <DialogDescription>
                        {canCreate
                            ? visibility === 'PROJECT'
                                ? t('createProjectDescription')
                                : t('createPrivateDescription')
                            : t('CreateDialog.loginDescription')}
                    </DialogDescription>
                </DialogHeader>
                {!canCreate ? (
                    <div className="py-4 text-center">
                        <p className="mb-4 text-muted-foreground">
                            {t('CreateDialog.loginRequired')}
                        </p>
                        <Button asChild>
                            <a href="/auth/login">{t('CreateDialog.loginAction')}</a>
                        </Button>
                    </div>
                ) : (
                    <form noValidate onSubmit={handleSubmit}>
                        <div className="grid gap-4 py-4">
                            {errorMessage ? (
                                <p
                                    id={errorId}
                                    role="alert"
                                    aria-live="assertive"
                                    className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                                >
                                    {errorMessage}
                                </p>
                            ) : null}
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor={nameId} className="text-right">
                                    {t('CreateDialog.name')}
                                </Label>
                                <Input
                                    ref={nameInputRef}
                                    id={nameId}
                                    value={formData.name}
                                    onChange={event =>
                                        handleInputChange('name', event.target.value)
                                    }
                                    placeholder={t('CreateDialog.namePlaceholder')}
                                    className="col-span-3"
                                    maxLength={DICTIONARY_CREATE_LIMITS.name}
                                    aria-required="true"
                                    aria-invalid={errorField === 'name'}
                                    aria-describedby={errorField === 'name' ? errorId : undefined}
                                    disabled={isSubmitting}
                                />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor={descriptionId} className="text-right">
                                    {t('CreateDialog.description')}
                                </Label>
                                <Textarea
                                    ref={descriptionInputRef}
                                    id={descriptionId}
                                    value={formData.description}
                                    onChange={event =>
                                        handleInputChange('description', event.target.value)
                                    }
                                    placeholder={t('CreateDialog.descriptionPlaceholder')}
                                    className="col-span-3"
                                    rows={3}
                                    maxLength={DICTIONARY_CREATE_LIMITS.description}
                                    aria-invalid={errorField === 'description'}
                                    aria-describedby={
                                        errorField === 'description' ? errorId : undefined
                                    }
                                    disabled={isSubmitting}
                                />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor={domainId} className="text-right">
                                    {t('CreateDialog.domain')}
                                </Label>
                                <Select
                                    value={formData.domain}
                                    onValueChange={value => handleInputChange('domain', value)}
                                    disabled={isSubmitting}
                                >
                                    <SelectTrigger
                                        ref={domainTriggerRef}
                                        id={domainId}
                                        className="col-span-3"
                                        aria-required="true"
                                        aria-invalid={errorField === 'domain'}
                                        aria-describedby={
                                            errorField === 'domain' ? errorId : undefined
                                        }
                                    >
                                        <SelectValue
                                            placeholder={t('CreateDialog.domainPlaceholder')}
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {getDomainOptions(key => tDomains(key)).map(option => (
                                            <SelectItem key={option.value} value={option.value}>
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={closeDialog}
                                disabled={isSubmitting}
                            >
                                {t('CreateDialog.cancel')}
                            </Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting
                                    ? t('CreateDialog.creating')
                                    : t('CreateDialog.create')}
                            </Button>
                        </DialogFooter>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}
