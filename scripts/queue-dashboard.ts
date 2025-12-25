import { createLogger } from '@/lib/logger';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import express from 'express';
import IORedis from 'ioredis';
const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const connection = new IORedis(redisUrl);
const logger = createLogger({
  type: 'queue',
}, {
  json: false,// 开启json格式输出
  pretty: false, // 关闭开发环境美化输出
  colors: true, // 仅当json：false时启用颜色输出可用
  includeCaller: false, // 日志不包含调用者
});
// 允许通过环境变量覆盖队列列表，例如: BULL_QUEUES=pretranslate,qa
const queueNames = (process.env.BULL_QUEUES || 'pretranslate,qa,doc-terms,memory-import')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const queues = queueNames.map((name) => new Queue(name, { connection }));

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: queues.map((q) => new BullMQAdapter(q)),
  serverAdapter,
});

const app = express();
app.use('/admin/queues', serverAdapter.getRouter());
app.get('/', (_req, res) => res.redirect('/admin/queues'));
app.get('/health', (_req, res) => res.send('ok'));

const port = Number(process.env.BULL_BOARD_PORT ?? 3001);
app.listen(port, () => {
  logger.info(`Bull Board running at http://localhost:${port}/admin/queues`);
  logger.info(`Redis: ${redisUrl}`);
  logger.info(`Queues: ${queueNames.join(', ')}`);
});


