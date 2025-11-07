import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 开始数据库种子...');

  // 检查测试账户是否已存在
  const existingUser = await prisma.user.findUnique({
    where: { email: 'test@example.com' },
  });

  if (existingUser) {
    console.log('✅ 测试账户已存在，跳过创建');
    return;
  }

  // 创建测试账户
  // 注意：密码是 "123456"
  const hashedPassword = await bcrypt.hash('123456', 10);

  const user = await prisma.user.create({
    data: {
      email: 'test@example.com',
      name: 'Demo User',
      password: hashedPassword,
      emailVerified: new Date(),
      role: 'USER',
    },
  });

  console.log('✅ 测试账户创建成功:');
  console.log('   邮箱: test@example.com');
  console.log('   密码: 123456');
  console.log('   用户ID:', user.id);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ 种子脚本执行失败:', e);
    await prisma.$disconnect();
    process.exit(1);
  });

