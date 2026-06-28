import { NextRequest, NextResponse } from 'next/server';
import { searchMemoryAction } from '@/actions/memories';
import { guardMessage, guardStatus, requireUser } from '@/lib/guards';
import { HybridSearchConfig } from '@/types/hybrid-search';

export async function POST(request: NextRequest) {
    try {
        await requireUser();
        const body = await request.json();
        const { query, limit, searchConfig } = body;

        if (!query || typeof query !== 'string') {
            return NextResponse.json({ error: '查询参数 query 是必需的' }, { status: 400 });
        }

        const result = await searchMemoryAction(query, {
            limit: limit || 10,
            searchConfig: searchConfig as Partial<HybridSearchConfig>,
        });

        return NextResponse.json(result);
    } catch (error) {
        return NextResponse.json({ error: guardMessage(error) }, { status: guardStatus(error) });
    }
}

// 获取默认配置
export async function GET() {
    await requireUser();
    const { DEFAULT_HYBRID_CONFIG } = await import('@/types/hybrid-search');

    return NextResponse.json({
        success: true,
        data: {
            defaultConfig: DEFAULT_HYBRID_CONFIG,
            availableModes: ['vector', 'keyword', 'hybrid'],
            fusionMethods: ['weighted_sum', 'rank_fusion', 'reciprocal_rank_fusion'],
            matchTypes: ['exact', 'phrase', 'fuzzy', 'contains'],
        },
    });
}
