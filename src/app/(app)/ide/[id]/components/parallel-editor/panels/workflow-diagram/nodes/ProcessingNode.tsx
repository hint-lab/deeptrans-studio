import React from 'react';
import { NodeProps } from '@xyflow/react';
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
                    <span className="text-lg">⚙️</span>
                </div>
                <div className="text-lg font-semibold tracking-tight">{data.label}</div>
            </div>
            <div className="mt-1 flex w-full items-center rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/70">
                <span className="mr-2 text-cyan-500 dark:text-cyan-400">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                    </svg>
                </span>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                    {data.processType || t('dataProcessing')}
                </span>
            </div>
        </div>
    );
}
