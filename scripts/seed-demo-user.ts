import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function ensureDemoTenant(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, tenantId: true },
  });
  if (!user) throw new Error('Demo user not found');
  if (user.tenantId) return user.tenantId;

  const tenant = await prisma.tenant.create({
    data: {
      name: 'Demo Workspace',
      description: 'Default tenant for demo user isolation',
      users: { connect: { id: user.id } },
    },
    select: { id: true },
  });
  return tenant.id;
}

async function main() {
  console.log('🌱 开始创建 Demo 测试账户...');

  // 检查测试账户是否已存在
  const existingUser = await prisma.user.findUnique({
    where: { email: 'test@example.com' },
  });

  if (existingUser) {
    const tenantId = await ensureDemoTenant(existingUser.id);
    console.log('✅ 测试账户已存在');
    console.log('   邮箱: test@example.com');
    console.log('   密码: 123456');
    console.log('   用户ID:', existingUser.id);
    console.log('   租户ID:', tenantId);
    return;
  }

  // 创建测试账户
  // 密码: 123456
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

  console.log('✅ 测试账户创建成功!');
  console.log('   邮箱: test@example.com');
  console.log('   密码: 123456');
  console.log('   用户ID:', user.id);
  console.log('   租户ID:', await ensureDemoTenant(user.id));
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
