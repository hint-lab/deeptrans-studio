import { NextRequest, NextResponse } from 'next/server';
import { cancelExperiment } from '@/server/experiments/orchestrator';
import { guardMessage, guardStatus, requireUser } from '@/lib/guards';

export async function POST(req: NextRequest) {
    try {
        const authCtx = await requireUser();
        const { jobId } = await req.json();

        if (!jobId) {
            return NextResponse.json({ success: false, error: 'Missing jobId' }, { status: 400 });
        }

        const cancelled = await cancelExperiment(jobId, authCtx);

        if (!cancelled) {
            return NextResponse.json(
                { success: false, error: 'Experiment not found or already completed' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            message: 'Experiment cancelled successfully',
        });
    } catch (error) {
        return NextResponse.json(
            { success: false, error: guardMessage(error) || 'Failed to cancel experiment' },
            { status: guardStatus(error) }
        );
    }
}
