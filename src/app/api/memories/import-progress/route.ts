import { NextRequest } from 'next/server';
import { importMemoryFromForm } from '@/actions/memories';

export async function POST(req: NextRequest) {
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            try {
                const formData = await req.formData();

                // 解析文件和参数
                const file = formData.get('file') as File;
                if (!file) {
                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ error: '缺少文件' })}\n\n`)
                    );
                    controller.close();
                    return;
                }

                // 估算批次数量（基于文件大小的简单估算）
                const fileSizeKB = file.size / 1024;
                const estimatedEntries = Math.max(1, Math.round(fileSizeKB / 0.5)); // 假设每条记录约 0.5KB
                const estimatedBatches = Math.ceil(estimatedEntries / 200); // 每批 200 条

                controller.enqueue(
                    encoder.encode(
                        `data: ${JSON.stringify({
                            type: 'init',
                            totalBatches: estimatedBatches,
                            stage: 'embedding',
                        })}\n\n`
                    )
                );

                // 模拟进度更新（实际应该从 importMemoryFromForm 中获取）
                let currentBatch = 0;
                const progressInterval = setInterval(() => {
                    if (currentBatch < estimatedBatches) {
                        currentBatch++;
                        const progress = (currentBatch / estimatedBatches) * 100;
                        controller.enqueue(
                            encoder.encode(
                                `data: ${JSON.stringify({
                                    type: 'progress',
                                    currentBatch,
                                    totalBatches: estimatedBatches,
                                    progress,
                                    stage:
                                        currentBatch < estimatedBatches * 0.8
                                            ? 'embedding'
                                            : 'milvus',
                                })}\n\n`
                            )
                        );
                    }
                }, 500);

                // 执行实际导入
                const result = await importMemoryFromForm(formData);

                clearInterval(progressInterval);

                controller.enqueue(
                    encoder.encode(
                        `data: ${JSON.stringify({
                            type: 'complete',
                            result,
                            stage: 'complete',
                        })}\n\n`
                    )
                );
            } catch (error: any) {
                controller.enqueue(
                    encoder.encode(
                        `data: ${JSON.stringify({
                            type: 'error',
                            error: error.message || '导入失败',
                        })}\n\n`
                    )
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
