import { NextRequest, NextResponse } from 'next/server';
import { startExperimentJob } from '@/server/experiments/orchestrator';
import { guardMessage, guardStatus, requireUser } from '@/lib/guards';

export async function POST(req: NextRequest) {
    try {
        const authCtx = await requireUser();
        const config = await req.json();

        // 验证必要参数
        if (!config.source || !config.srcLang || !config.tgtLang) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields: source, srcLang, tgtLang' },
                { status: 400 }
            );
        }

        // 启动实验任务
        const jobId = await startExperimentJob(config, authCtx);

        return NextResponse.json({
            success: true,
            jobId,
            message: 'Experiment started successfully',
        });
    } catch (error) {
        return NextResponse.json(
            { success: false, error: guardMessage(error) || 'Failed to start experiment' },
            { status: guardStatus(error) }
        );
    }
}
