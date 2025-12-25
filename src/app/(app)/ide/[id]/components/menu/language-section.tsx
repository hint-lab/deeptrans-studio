// 语言选择部分
import { LanguageSelector } from '@/components/language-selector';
import { useEffect, useState, useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { LANGUAGES } from '@/constants/languages';
import { useParams } from 'next/navigation';
import { fetchProjectByIdAction } from '@/actions/project';
import { useTranslationLanguage } from '@/hooks/useTranslation';
export function LanguageSection() {
    const languages = LANGUAGES;
    const params = useParams();
    const projectId = (params as any)?.id as string | undefined;
    const [source, setSource] = useState<string>('');
    const [target, setTarget] = useState<string>('');
    const { setSourceTranslationLanguage, setTargetTranslationLanguage } = useTranslationLanguage();

    useEffect(() => {
        let mounted = true;
        if (!projectId) return;
        fetchProjectByIdAction(projectId)
            .then(proj => {
                if (!mounted || !proj) return;
                setSource((proj as any).sourceLanguage || '');
                setTarget((proj as any).targetLanguage || '');
                setSourceTranslationLanguage((proj as any).sourceLanguage || '');
                setTargetTranslationLanguage((proj as any).targetLanguage || '');
            })
            .catch(() => {});
        return () => {
            mounted = false;
        };
    }, [projectId]);
    return (
        <div className="flex max-w-[500px] items-center px-3">
            <LanguageSelector
                type="source"
                items={languages.filter(l => l.key === source)}
                value={source}
                defaultValue={source}
                onSelect={setSource}
            />
            <ArrowRight size={16} strokeWidth={1.5} />
            <LanguageSelector
                type="target"
                items={languages.filter(l => l.key === target)}
                value={target}
                defaultValue={target}
                onSelect={setTarget}
            />
        </div>
    );
}
