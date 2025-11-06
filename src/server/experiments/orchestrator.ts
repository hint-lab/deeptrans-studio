import { runExperimentPipeline } from './pipeline';
import { ExperimentConfig, ExperimentStatus, ExperimentResult } from '@/server/experiments/types';

// 内存存储实验状态（生产环境建议用Redis或数据库）
const experimentStore = new Map<string, {
    status: ExperimentStatus;
    config: ExperimentConfig;
    result?: ExperimentResult;
    startTime: number;
    endTime?: number;
}>();

export async function startExperimentJob(config: ExperimentConfig): Promise<string> {
    const jobId = `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 初始化实验状态
    experimentStore.set(jobId, {
        status: {
            jobId,
            status: 'pending',
            progress: 0,
            currentStage: 'initializing',
            message: 'Experiment queued'
        },
        config,
        startTime: Date.now()
    });

    // 异步执行实验
    setImmediate(async () => {
        try {
            await runExperimentPipeline(jobId, config);
        } catch (error) {
            console.error(`Experiment ${jobId} failed:`, error);
            const experiment = experimentStore.get(jobId);
            if (experiment) {
                experiment.status = {
                    ...experiment.status,
                    status: 'failed',
                    message: error instanceof Error ? error.message : 'Unknown error'
                };
            }
        }
    });

    return jobId;
}

export async function getExperimentStatus(jobId: string): Promise<ExperimentStatus | null> {
    const experiment = experimentStore.get(jobId);
    return experiment?.status || null;
}

export async function getExperimentResult(jobId: string): Promise<ExperimentResult | null> {
    const experiment = experimentStore.get(jobId);
    return experiment?.result || null;
}

export async function cancelExperiment(jobId: string): Promise<boolean> {
    const experiment = experimentStore.get(jobId);
    if (!experiment || experiment.status.status === 'completed' || experiment.status.status === 'failed') {
        return false;
    }

    experiment.status = {
        ...experiment.status,
        status: 'cancelled',
        message: 'Experiment cancelled by user'
    };

    return true;
}

export function updateExperimentStatus(jobId: string, status: Partial<ExperimentStatus>): void {
    const experiment = experimentStore.get(jobId);
    if (experiment) {
        experiment.status = { ...experiment.status, ...status };
    }
}

export function setExperimentResult(jobId: string, result: ExperimentResult): void {
    const experiment = experimentStore.get(jobId);
    if (experiment) {
        experiment.result = result;
        experiment.status = {
            ...experiment.status,
            status: 'completed',
            progress: 100,
            currentStage: 'completed',
            message: 'Experiment completed successfully'
        };
        experiment.endTime = Date.now();
    }
}
