'use client';
import React, { useEffect, useState } from 'react';
import { LANGUAGES } from '@/constants/languages';
import { Button } from 'src/components/ui/button';
import { Textarea } from 'src/components/ui/textarea';
import { Card, CardFooter, CardContent } from 'src/components/ui/card';
import { Mic, Undo2, ArrowLeftRight, FileText, RotateCw } from 'lucide-react';
import { cn } from 'src/lib/utils';
import { runPreTranslateAction } from '@/actions/pre-translate';
import { LanguageSelector } from '@/components/language-selector';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslationLanguage, useTranslationContent } from '@/hooks/useTranslation';

const TextTranslationTable = () => {
    const languages = LANGUAGES;
    const {
        sourceLanguage,
        targetLanguage,
        setSourceTranslationLanguage,
        setTargetTranslationLanguage,
    } = useTranslationLanguage();
    const { sourceText, targetText, setSourceTranslationText, setTargetTranslationText } =
        useTranslationContent();
    const [isTranslating, setIsTranslating] = useState(false);

    useEffect(() => {
        setSourceTranslationLanguage(targetLanguage);
        setTargetTranslationLanguage(sourceLanguage);
    }, [sourceLanguage, targetLanguage]);

    const handleTranslation = async () => {
        if (!sourceText.trim()) return;

        try {
            setIsTranslating(true);
            // 模拟翻译请求
            setTimeout(async () => {
                setTargetTranslationText(sourceText);
                const pre = await runPreTranslateAction(
                    sourceText,
                    sourceLanguage,
                    targetLanguage,
                    { prompt: undefined }
                );
                setTargetTranslationText((pre as any)?.translation || '');
                setIsTranslating(false);
            }, 1000);
        } catch (error) {
            console.error('Error:', error);
            setIsTranslating(false);
        }
    };

    const clearText = () => {
        setSourceTranslationText('');
        setTargetTranslationText('');
    };

    const swapLanguages = () => {
        setSourceTranslationLanguage(targetLanguage);
        setTargetTranslationLanguage(sourceLanguage);
        // 语言交换逻辑（需要与LanguageSelect组件配合）
    };

    return (
        <div className="flex h-full w-full flex-col">
            {/* 顶部语言选择栏 */}
            <div className="flex w-full items-center justify-between rounded-t-lg border-b bg-card p-2">
                <div className="flex w-full items-center gap-4">
                    <div className="flex w-1/2 items-center justify-between gap-2">
                        <LanguageSelector
                            placeholder="检测源语言"
                            items={languages}
                            value={sourceLanguage}
                            onSelect={setSourceTranslationLanguage}
                        />

                        <Button
                            variant="ghost"
                            onClick={swapLanguages}
                            className="w-12 p-2 transition-colors hover:bg-muted"
                        >
                            <ArrowLeftRight size="18" className="text-foreground" />
                        </Button>
                    </div>

                    <div className="flex w-1/2 items-center gap-2">
                        <LanguageSelector
                            placeholder="目标语言"
                            items={languages}
                            value={targetLanguage}
                            onSelect={setTargetTranslationLanguage}
                        />

                        <div className="ml-auto flex items-center gap-2">
                            <Button variant="ghost" size="sm" className="text-foreground">
                                自动
                            </Button>
                            <Button variant="ghost" size="sm" className="text-foreground">
                                术语表
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* 翻译区域 */}
            <div className="grid flex-1 grid-cols-1 border-b lg:grid-cols-2">
                {/* 输入区域 */}
                <div className="flex flex-col border-r">
                    <Textarea
                        value={sourceText}
                        placeholder="使用我们的文档翻译器拖放翻译PDF、Word（.docx）和PowerPoint（.pptx）文件。
请点击麦克风图标来翻译语音。"
                        onChange={e => setSourceTranslationText(e.target.value)}
                        className="min-h-[300px] flex-1 resize-none rounded-none border-none bg-card p-4 focus-visible:ring-0 focus-visible:ring-offset-0"
                    />

                    <div className="flex items-center justify-between bg-card p-2">
                        <div className="text-xs text-muted-foreground"></div>
                        <div className="flex items-center gap-2">
                            <button className="rounded-full p-2 transition-colors hover:bg-muted">
                                <FileText size="16" className="text-foreground" />
                            </button>
                            <button className="rounded-full p-2 transition-colors hover:bg-muted">
                                <Mic size="16" className="text-foreground" />
                            </button>
                            <button
                                className="rounded-full p-2 transition-colors hover:bg-muted"
                                onClick={clearText}
                            >
                                <Undo2 size="16" className="text-foreground" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* 输出区域 */}
                <div className="flex flex-col">
                    {isTranslating ? (
                        <div className="flex-1 bg-card p-4">
                            <Skeleton className="h-[300px] w-full rounded-md" />
                        </div>
                    ) : (
                        <Textarea
                            value={targetText}
                            placeholder="翻译结果"
                            readOnly
                            className="min-h-[300px] flex-1 resize-none rounded-none border-none bg-card p-4 focus-visible:ring-0 focus-visible:ring-offset-0"
                        />
                    )}

                    <div className="flex items-center justify-between bg-card p-2">
                        <div></div>
                        <div className="flex items-center gap-2">
                            <button className="rounded-full p-2 transition-colors hover:bg-muted">
                                <Mic size="16" className="text-foreground" />
                            </button>
                            <Button
                                onClick={handleTranslation}
                                className="bg-primary text-primary-foreground hover:bg-primary/90"
                                disabled={isTranslating || !sourceText.trim()}
                            >
                                {isTranslating ? '翻译中...' : '翻译'}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TextTranslationTable;
