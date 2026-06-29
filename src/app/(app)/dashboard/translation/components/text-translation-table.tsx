'use client';
import { runPreTranslateAction } from '@/actions/pre-translate';
import { LanguageSelector } from '@/components/language-selector';
import { Skeleton } from '@/components/ui/skeleton';
import { LANGUAGES } from '@/constants/languages';
import { useTranslationContent, useTranslationLanguage } from '@/hooks/useTranslation';
import { createLogger } from '@/lib/logger';
import { ArrowLeftRight, FileText, Mic, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from 'src/components/ui/button';
import { Textarea } from 'src/components/ui/textarea';
const logger = createLogger({
    type: 'translation:text-translation-table',
}, {
    json: false,// 开启json格式输出
    pretty: false, // 关闭开发环境美化输出
    colors: true, // 仅当json：false时启用颜色输出可用
    includeCaller: false, // 日志不包含调用者
});
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
    const [translationError, setTranslationError] = useState<string | null>(null);

    const handleTranslation = async () => {
        const text = sourceText.trim();
        if (!text || isTranslating) return;

        setTranslationError(null);
        setTargetTranslationText('');
        setIsTranslating(true);
        try {
            const pre = await runPreTranslateAction(text, sourceLanguage, targetLanguage, {
                prompt: undefined,
            });
            const translation = (pre as any)?.translation;
            if (!translation) {
                throw new Error('翻译服务未返回结果');
            }
            setTargetTranslationText(translation);
        } catch (error) {
            logger.error('handleTranslation 失败:', error);
            setTranslationError(error instanceof Error ? error.message : '翻译失败，请稍后重试');
        } finally {
            setIsTranslating(false);
        }
    };

    const clearText = () => {
        setSourceTranslationText('');
        setTargetTranslationText('');
        setTranslationError(null);
    };

    const swapLanguages = () => {
        setSourceTranslationLanguage(targetLanguage);
        setTargetTranslationLanguage(sourceLanguage);
        setSourceTranslationText(targetText);
        setTargetTranslationText(sourceText);
        setTranslationError(null);
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
                        placeholder="使用我们的文档翻译器拖放翻译 PDF、Word（.docx）、TXT 或 Markdown 文件。
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
                        <div className="flex-1 space-y-3 bg-card p-4">
                            <Skeleton className="h-5 w-4/5 rounded-md" />
                            <Skeleton className="h-5 w-2/3 rounded-md" />
                            <Skeleton className="h-5 w-3/4 rounded-md" />
                        </div>
                    ) : translationError ? (
                        <div className="flex min-h-[300px] flex-1 items-start bg-card p-4 text-sm text-destructive">
                            {translationError}
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
