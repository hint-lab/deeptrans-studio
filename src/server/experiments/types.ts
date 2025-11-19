export interface ExperimentConfig {
    source: string;
    srcLang: string;
    tgtLang: string;
    options: {
        hierarchical?: boolean;
        useTermBase?: boolean;
        useRuleTable?: boolean;
        useTM?: boolean;
        topK?: number;
        model?: string;
        temperature?: number;
    };
}

export interface ExperimentStatus {
    jobId: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    progress: number; // 0-100
    currentStage: string;
    message: string;
    startTime?: number;
    endTime?: number;
}

export interface ExperimentResult {
    jobId: string;
    success: boolean;
    trace: {
        r1?: {
            termTable: Array<{ source: string; target: string; confidence: number }>;
            output: string;
        };
        r2?: {
            syntaxMap: Record<string, string>;
            output: string;
        };
        r3?: {
            tmRefs: Array<{ source: string; target: string; similarity: number }>;
            output: string;
        };
    };
    final: string;
    // 指标计算由Python端负责，服务器端不计算metrics
    error?: string;
    duration?: number; // milliseconds
}

export interface ExperimentMetrics {
    termbaseAccuracy: number;
    deonticPreservation: number;
    conditionalLogicPreservation: number;
    cometScore: number;
}
