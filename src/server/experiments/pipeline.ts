import { ExperimentConfig } from '@/server/experiments/types';
import { updateExperimentStatus } from './orchestrator';
import { createLogger } from '@/lib/logger';

const logger = createLogger({ type: 'server:experiments:pipeline' });

export async function runExperimentPipeline(
    jobId: string,
    config: ExperimentConfig
): Promise<void> {
    try {
        updateExperimentStatus(jobId, {
            status: 'running',
            progress: 10,
            currentStage: 'initializing',
            message: 'Initializing experiment pipeline',
        });

        const requestedStages = [
            config.options.useTermBase !== false && 'termbase',
            config.options.useRuleTable !== false && 'rule_table',
            config.options.useTM !== false && 'translation_memory',
        ].filter(Boolean);

        if (requestedStages.length === 0) {
            throw new Error('No experiment stages enabled.');
        }

        updateExperimentStatus(jobId, {
            progress: 20,
            currentStage: 'unsupported',
            message: 'Experiment pipeline is not connected to a production execution engine.',
        });

        throw new Error(
            `Experiment pipeline is unavailable: ${requestedStages.join(', ')} stages are not connected to a production execution engine.`
        );
    } catch (error) {
        logger.error('Experiment failed', { jobId, error });
        updateExperimentStatus(jobId, {
            status: 'failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}
