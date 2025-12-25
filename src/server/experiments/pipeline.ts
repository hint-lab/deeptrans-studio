import { ExperimentConfig, ExperimentResult } from '@/server/experiments/types';
import { updateExperimentStatus, setExperimentResult } from './orchestrator';

export async function runExperimentPipeline(
    jobId: string,
    config: ExperimentConfig
): Promise<void> {
    const startTime = Date.now();

    try {
        // 更新状态：开始运行
        updateExperimentStatus(jobId, {
            status: 'running',
            progress: 10,
            currentStage: 'initializing',
            message: 'Initializing experiment pipeline',
        });

        const result: ExperimentResult = {
            jobId,
            success: false,
            trace: {},
            final: '',
            duration: 0,
        };

        // Round 1: Terminology Accuracy Control
        if (config.options.useTermBase !== false) {
            updateExperimentStatus(jobId, {
                progress: 30,
                currentStage: 'round1_terminology',
                message: 'Running Round 1: Terminology extraction and validation',
            });

            const r1Result = await runTerminologyWorkflow(config);
            result.trace.r1 = r1Result;
        }

        // Round 2: Syntactic Consistency Control
        if (config.options.useRuleTable !== false) {
            updateExperimentStatus(jobId, {
                progress: 60,
                currentStage: 'round2_syntax',
                message: 'Running Round 2: Syntactic pattern analysis and correction',
            });

            const r2Result = await runSyntacticWorkflow(
                config,
                result.trace.r1?.output || config.source
            );
            result.trace.r2 = r2Result;
        }

        // Round 3: Discourse Conformity
        if (config.options.useTM !== false) {
            updateExperimentStatus(jobId, {
                progress: 80,
                currentStage: 'round3_discourse',
                message: 'Running Round 3: Discourse-level refinement',
            });

            const r3Result = await runDiscourseWorkflow(
                config,
                result.trace.r2?.output || result.trace.r1?.output || config.source
            );
            result.trace.r3 = r3Result;
        }

        // 确定最终输出
        result.final =
            result.trace.r3?.output ||
            result.trace.r2?.output ||
            result.trace.r1?.output ||
            config.source;
        result.success = true;

        // 完成翻译工作流
        result.duration = Date.now() - startTime;

        // 完成实验
        setExperimentResult(jobId, result);
    } catch (error) {
        console.error(`Experiment ${jobId} failed:`, error);
        updateExperimentStatus(jobId, {
            status: 'failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

async function runTerminologyWorkflow(config: ExperimentConfig) {
    // TODO: 实现术语工作流
    // 1. 提取源文法律术语
    // 2. 查询TermBase
    // 3. 验证和过滤
    // 4. 生成术语翻译表

    return {
        termTable: [
            { source: '合同', target: 'contract', confidence: 0.95 },
            { source: '违约', target: 'breach', confidence: 0.92 },
        ],
        output: config.source, // 临时返回原文
    };
}

async function runSyntacticWorkflow(config: ExperimentConfig, input: string) {
    // TODO: 实现句法工作流
    // 1. 提取情态动词和条件结构
    // 2. 应用Rule Table映射
    // 3. 自动选择最佳修正
    // 4. 生成句法修正输出

    return {
        syntaxMap: {
            shall: '必须',
            may: '可以',
            'shall not': '不得',
        },
        output: input, // 临时返回输入
    };
}

async function runDiscourseWorkflow(config: ExperimentConfig, input: string) {
    // TODO: 实现篇章工作流
    // 1. 检索Translation Memory
    // 2. 评估篇章适当性
    // 3. 选择最佳参考
    // 4. 生成最终输出

    return {
        tmRefs: [{ source: '相关条款', target: 'relevant provisions', similarity: 0.88 }],
        output: input, // 临时返回输入
    };
}
