import { NextRequest, NextResponse } from 'next/server';
import { startExperimentJob } from '@/server/experiments/orchestrator';

export async function POST(req: NextRequest) {
    try {
        const config = await req.json();

        // 验证必要参数
        if (!config.source || !config.srcLang || !config.tgtLang) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields: source, srcLang, tgtLang' },
                { status: 400 }
            );
        }

        // 启动实验任务
        const jobId = await startExperimentJob(config);

        return NextResponse.json({
            success: true,
            jobId,
            message: 'Experiment started successfully',
        });
    } catch (error) {
        console.error('Failed to start experiment:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to start experiment' },
            { status: 500 }
        );
    }
}
