import { NextRequest, NextResponse } from 'next/server';
import { getExperimentStatus } from '@/server/experiments/orchestrator';
import { guardMessage, guardStatus, requireUser } from '@/lib/guards';

export async function GET(req: NextRequest) {
    try {
        const authCtx = await requireUser();
        const { searchParams } = new URL(req.url);
        const jobId = searchParams.get('jobId');

        if (!jobId) {
            return NextResponse.json(
                { success: false, error: 'Missing jobId parameter' },
                { status: 400 }
            );
        }

        const status = await getExperimentStatus(jobId, authCtx);

        if (!status) {
            return NextResponse.json(
                { success: false, error: 'Experiment not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            status,
        });
    } catch (error) {
        return NextResponse.json(
            { success: false, error: guardMessage(error) || 'Failed to get experiment status' },
            { status: guardStatus(error) }
        );
    }
}
