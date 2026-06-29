'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BookOpen, FileText } from 'lucide-react';
import { toast } from 'sonner';

type TranslationResultSummary = {
    sourceLanguage: string;
    targetLanguage: string;
    fileName: string;
};

type MediaTranslationWorkspaceLabels = {
    translate: string;
    translating: string;
    startTranslation: string;
    retry: string;
    ocrResult?: string;
    translationResult: string;
    sourceLanguage: string;
    targetLanguage: string;
    copy: string;
    copiedToClipboard: string;
    downloadResult: string;
    saveToMyTranslations?: string;
};

type MediaTranslationWorkspaceProps = {
    labels: MediaTranslationWorkspaceLabels;
    canTranslate: boolean;
    isTranslating: boolean;
    status: string;
    recognizedText?: string | null;
    translatedContent?: string | null;
    result?: TranslationResultSummary | null;
    onTranslate: () => void | Promise<void>;
    onDownload: () => void;
    onSave?: () => void;
};

export function MediaTranslationWorkspace({
    labels,
    canTranslate,
    isTranslating,
    status,
    recognizedText,
    translatedContent,
    result,
    onTranslate,
    onDownload,
    onSave,
}: MediaTranslationWorkspaceProps) {
    const isProcessing = isTranslating || status === 'processing';

    const copyResult = async () => {
        if (!translatedContent) return;
        await navigator.clipboard.writeText(translatedContent);
        toast.success(labels.copiedToClipboard);
    };

    return (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                <div className="text-lg font-medium">{labels.translate}</div>
            </div>
            <div className="p-4">
                <div className="flex items-center gap-4">
                    <Button
                        type="button"
                        className="w-40"
                        onClick={() => {
                            void onTranslate();
                        }}
                        disabled={!canTranslate || isProcessing}
                    >
                        {isProcessing ? (
                            <>
                                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                {labels.translating}
                            </>
                        ) : (
                            labels.startTranslation
                        )}
                    </Button>

                    {isProcessing && (
                        <div className="flex-1">
                            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                                <div className="h-full w-1/3 animate-pulse rounded-full bg-blue-600" />
                            </div>
                        </div>
                    )}

                    {status === 'failed' && (
                        <Button
                            type="button"
                            className="w-40"
                            variant="outline"
                            onClick={() => {
                                void onTranslate();
                            }}
                        >
                            {labels.retry}
                        </Button>
                    )}
                </div>

                {recognizedText && labels.ocrResult && (
                    <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800">
                        <div className="mb-2 text-sm font-semibold">{labels.ocrResult}</div>
                        <ScrollArea className="max-h-48 rounded-md border bg-white p-3 dark:bg-gray-900">
                            <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700 dark:text-gray-200">
                                {recognizedText}
                            </div>
                        </ScrollArea>
                    </div>
                )}

                {translatedContent && result && (
                    <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-800">
                        <div className="mb-4 flex items-center justify-between gap-4">
                            <div>
                                <div className="text-lg font-semibold">
                                    {labels.translationResult}
                                </div>
                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                    {labels.sourceLanguage}: {result.sourceLanguage} →
                                    {labels.targetLanguage}: {result.targetLanguage}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Badge variant="outline">{result.fileName}</Badge>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={copyResult}
                                >
                                    {labels.copy}
                                </Button>
                            </div>
                        </div>

                        <ScrollArea className="h-96 rounded-md border p-4">
                            <div className="whitespace-pre-wrap text-sm leading-relaxed">
                                {translatedContent}
                            </div>
                        </ScrollArea>

                        <div className="mt-4 flex gap-3">
                            <Button type="button" onClick={onDownload}>
                                <FileText className="mr-2 h-4 w-4" />
                                {labels.downloadResult}
                            </Button>
                            {onSave && labels.saveToMyTranslations && (
                                <Button type="button" variant="outline" onClick={onSave}>
                                    <BookOpen className="mr-2 h-4 w-4" />
                                    {labels.saveToMyTranslations}
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
