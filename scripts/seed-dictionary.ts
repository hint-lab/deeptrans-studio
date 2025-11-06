#!/usr/bin/env ts-node

/**
 * 种子数据脚本 - 创建基础词典数据
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const testDictionaryEntries = [
  // 技术术语
  { sourceText: 'API', targetText: '应用程序接口' },
  { sourceText: 'database', targetText: '数据库' },
  { sourceText: 'framework', targetText: '框架' },
  { sourceText: 'server', targetText: '服务器' },
  { sourceText: 'client', targetText: '客户端' },
  { sourceText: 'authentication', targetText: '身份验证' },
  { sourceText: 'authorization', targetText: '授权' },
  { sourceText: 'deployment', targetText: '部署' },
  { sourceText: 'configuration', targetText: '配置' },
  { sourceText: 'interface', targetText: '接口' },
  
  // 商业术语
  { sourceText: 'business', targetText: '业务' },
  { sourceText: 'product', targetText: '产品' },
  { sourceText: 'service', targetText: '服务' },
  { sourceText: 'customer', targetText: '客户' },
  { sourceText: 'management', targetText: '管理' },
  { sourceText: 'strategy', targetText: '策略' },
  { sourceText: 'solution', targetText: '解决方案' },
  { sourceText: 'requirement', targetText: '需求' },
  { sourceText: 'analysis', targetText: '分析' },
  { sourceText: 'implementation', targetText: '实施' },
  
  // 通用术语
  { sourceText: 'development', targetText: '开发' },
  { sourceText: 'application', targetText: '应用' },
  { sourceText: 'system', targetText: '系统' },
  { sourceText: 'platform', targetText: '平台' },
  { sourceText: 'environment', targetText: '环境' },
  { sourceText: 'performance', targetText: '性能' },
  { sourceText: 'security', targetText: '安全' },
  { sourceText: 'integration', targetText: '集成' },
  { sourceText: 'optimization', targetText: '优化' },
  { sourceText: 'monitoring', targetText: '监控' }
];

async function seedDictionary() {
  try {
    console.log('开始创建词典种子数据...');

    // 查找或创建公共词典
    let publicDictionary = await prisma.dictionary.findFirst({
      where: {
        visibility: 'PUBLIC',
        name: '通用技术词典'
      }
    });

    if (!publicDictionary) {
      publicDictionary = await prisma.dictionary.create({
        data: {
          name: '通用技术词典',
          description: '包含常用技术和商业术语的公共词典',
          domain: 'technology',
          visibility: 'PUBLIC'
        }
      });
      console.log('创建公共词典:', publicDictionary.name);
    } else {
      console.log('找到现有公共词典:', publicDictionary.name);
    }

    // 检查是否已有词典条目
    const existingCount = await prisma.dictionaryEntry.count({
      where: { dictionaryId: publicDictionary.id }
    });

    if (existingCount > 0) {
      console.log(`词典中已有 ${existingCount} 个条目，跳过种子数据创建`);
      return;
    }

    // 创建词典条目
    const entries = testDictionaryEntries.map(entry => ({
      ...entry,
      dictionaryId: publicDictionary.id,
      origin: 'seed',
      enabled: true
    }));

    const result = await prisma.dictionaryEntry.createMany({
      data: entries,
      skipDuplicates: true
    });

    console.log(`成功创建 ${result.count} 个词典条目`);

    // 验证创建结果
    const totalEntries = await prisma.dictionaryEntry.count({
      where: { dictionaryId: publicDictionary.id }
    });
    console.log(`词典中现有总条目数: ${totalEntries}`);

    console.log('词典种子数据创建完成！');

  } catch (error) {
    console.error('创建词典种子数据失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  seedDictionary()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { seedDictionary };
