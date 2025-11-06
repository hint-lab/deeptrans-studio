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
        <div className="w-64 p-4 rounded-xl flex flex-col gap-3
                   bg-gradient-to-br from-white to-gray-50 
                   dark:from-gray-800 dark:to-gray-900
                   shadow-[0_8px_30px_rgb(0,0,0,0.12)] 
                   border border-cyan-100 dark:border-cyan-900/30
                   hover:shadow-lg hover:scale-[1.02] transition-all duration-300
                   text-gray-800 dark:text-white">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 
                       rounded-lg flex items-center justify-center text-white
                       shadow-md shadow-cyan-200 dark:shadow-cyan-900/30">
                    <span className="text-lg">⚙️</span>
                </div>
                <div className="font-semibold text-lg tracking-tight">{data.label}</div>
            </div>
            <div className="w-full flex items-center mt-1 px-3 py-2 rounded-lg 
                    bg-gray-50 dark:bg-gray-800/70 border border-gray-100 dark:border-gray-700">
                <span className="mr-2 text-cyan-500 dark:text-cyan-400">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                    </svg>
                </span>
                <span className="text-sm text-gray-600 dark:text-gray-400">{data.processType || t('dataProcessing')}</span>
            </div>
        </div>
    );
} 