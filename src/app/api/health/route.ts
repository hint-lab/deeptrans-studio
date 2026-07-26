import { NextResponse } from 'next/server';

// This probe deliberately has no database, queue, storage, or model
// dependency. A successful response proves only that the Web process can
// serve a route; the guarded local dependency check and worker heartbeat own
// their respective readiness contracts.
export const dynamic = 'force-dynamic';

export function GET() {
    return NextResponse.json(
        { status: 'ok', scope: 'web' },
        {
            headers: {
                'Cache-Control': 'no-store',
            },
        }
    );
}
