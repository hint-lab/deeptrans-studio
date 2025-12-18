import { NextRequest, NextResponse } from 'next/server';
import { cancelExperiment } from '@/server/experiments/orchestrator';

export async function POST(req: NextRequest) {
    try {
        const { jobId } = await req.json();

        if (!jobId) {
            return NextResponse.json({ success: false, error: 'Missing jobId' }, { status: 400 });
        }

        const cancelled = await cancelExperiment(jobId);

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
        console.error('Failed to cancel experiment:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to cancel experiment' },
            { status: 500 }
        );
    }
}
