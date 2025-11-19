"use client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import React, { useEffect } from 'react';
import { useTranslations } from 'next-intl';

export type LanguageSelectorProps = {
    type?: 'source' | 'target';
    label?: string;
    placeholder?: string;
    items?: Array<{ id: string; key: string; labelKey: string }>;
    defaultValue?: string;
    value?: string;
    onSelect?: (value: string) => void;
};

export const LanguageSelector = React.forwardRef<HTMLDivElement, LanguageSelectorProps>(({ type, label, placeholder, items, defaultValue, value, onSelect }, ref) => {
    const t = useTranslations('Common.languages');

    const handleValueChange = (newValue: string) => {
        onSelect?.(newValue);
    };

    useEffect(() => {
        if (defaultValue) {
            onSelect?.(defaultValue);
        }
    }, [defaultValue, onSelect]);

    return (
        <SelectGroup ref={ref} className='flex flex-row w-28 items-center justify-center py-1'>
            {label && <SelectLabel className='whitespace-nowrap'>{label}</SelectLabel>}
            <div className='w-24'>
                <Select defaultValue={defaultValue} value={value} onValueChange={handleValueChange}>
                    <SelectTrigger className='flex items-center justify-between bg-card'>
                        {placeholder !== 'auto' && <SelectValue placeholder={placeholder} />}
                    </SelectTrigger>
                    <SelectContent>
                        {items && (
                            items.map(item => (
                                <SelectItem key={item.id} value={item.key}>
                                    {t(item.labelKey)}
                                </SelectItem>
                            ))
                        )}
                    </SelectContent>
                </Select>
            </div>
        </SelectGroup>
    );
});