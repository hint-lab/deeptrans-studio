export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // 只需要加载一次，确保 pino 可用
    // 不在这里创建实例，让各模块自己创建
    console.log('Logging support enabled for Node.js runtime');
  }
}