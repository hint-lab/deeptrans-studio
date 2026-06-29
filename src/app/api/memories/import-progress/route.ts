import { NextRequest } from 'next/server';
import { importMemoryFromForm } from '@/actions/memories';
import { requireUser } from '@/lib/guards';

export async function POST(req: NextRequest) {
    await requireUser();
    const encoder = new TextEncoder();
    const encodeEvent = (payload: Record<string, unknown>) =>
        encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);

    const stream = new ReadableStream({
        async start(controller) {
            try {
                const formData = await req.formData();

                // 解析文件和参数
                const file = formData.get('file') as File;
                if (!file) {
                    controller.enqueue(encodeEvent({ type: 'error', error: '缺少文件' }));
                    controller.close();
                    return;
                }

                const result = await importMemoryFromForm(formData, event => {
                    controller.enqueue(encodeEvent(event));
                });

                controller.enqueue(
                    encodeEvent({
                        type: 'complete',
                        result,
                        stage: 'complete',
                    })
                );
            } catch (error: any) {
                controller.enqueue(
                    encodeEvent({
                        type: 'error',
                        error: error.message || '导入失败',
                    })
                );
            } finally {
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
        },
    });
}
