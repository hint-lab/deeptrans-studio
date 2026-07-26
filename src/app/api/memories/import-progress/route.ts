import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/guards';

/**
 * Replaced by the durable upload + queue protocol at `/api/memories/import`.
 * Keeping this route as an explicit authenticated 410 prevents old tabs from
 * silently reaching the former streaming, non-idempotent write path.
 */
export async function POST() {
    await requireUser();
    return NextResponse.json(
        {
            success: false,
            error: '旧版导入协议已停用，请刷新页面后使用后台导入。',
        },
        {
            status: 410,
            headers: { Deprecation: 'true' },
        }
    );
}
