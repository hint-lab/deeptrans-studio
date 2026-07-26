import React from 'react';
import { Activity, Cog } from 'lucide-react';
import { useTranslations } from 'next-intl';

export interface ProcessingNodeData {
    label: string;
    processType?: string;
    [key: string]: unknown;
}

export function ProcessingNode({ data }: any) {
    const t = useTranslations('IDE.workflowNode');
    return (
        <div className="flex w-64 flex-col gap-3 rounded-xl border border-cyan-100 bg-gradient-to-br from-white to-gray-50 p-4 text-gray-800 shadow-[0_8px_30px_rgb(0,0,0,0.12)] transition-all duration-300 hover:scale-[1.02] hover:shadow-lg dark:border-cyan-900/30 dark:from-gray-800 dark:to-gray-900 dark:text-white">
            <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-200 dark:shadow-cyan-900/30">
                    <Cog className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="text-lg font-semibold tracking-tight">{data.label}</div>
            </div>
            <div className="mt-1 flex w-full items-center rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/70">
                <span className="mr-2 text-cyan-500 dark:text-cyan-400">
                    <Activity className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                    {data.processType || t('dataProcessing')}
                </span>
            </div>
        </div>
    );
}
