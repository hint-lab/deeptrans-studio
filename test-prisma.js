const { PrismaClient } = require('@prisma/client');

async function testPrisma() {
  const prisma = new PrismaClient();
  
  try {
    // 测试查询一个文档项，包含新字段
    const item = await prisma.documentItem.findFirst({
      select: {
        id: true,
        preTranslateTerms: true,
        preTranslateDict: true,
        preTranslateEmbedded: true,
        qualityAssureBiTerm: true,
        qualityAssureSyntax: true,
        qualityAssureDiscourse: true,
      }
    });
    
    console.log('✅ Prisma客户端可以正确识别新字段');
    console.log('查询结果:', item);
    
    // 测试更新操作
    if (item) {
      await prisma.documentItem.update({
        where: { id: item.id },
        data: {
          preTranslateTerms: { test: 'data' },
          preTranslateDict: { test: 'data' },
          preTranslateEmbedded: 'test translation',
        }
      });
      console.log('✅ 更新操作成功');
    }
    
  } catch (error) {
    console.error('❌ Prisma客户端错误:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testPrisma();
