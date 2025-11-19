import { getLocale } from 'next-intl/server';
import zhDocs from './zh.json';
import enDocs from './en.json';

// 导入拆分后的页面文件
import gettingStartedZh from './pages-zh/gettingStarted-zh.json';
import conceptsZh from './pages-zh/concepts-zh.json';
import workflowsZh from './pages-zh/workflows-zh.json';
import installationZh from './pages-zh/installation-zh.json';
import uiZh from './pages-zh/ui-zh.json';
import serverActionsZh from './pages-zh/serverActions-zh.json';
import stateZh from './pages-zh/state-zh.json';
import aiZh from './pages-zh/ai-zh.json';
import databaseZh from './pages-zh/database-zh.json';
import troubleshootingZh from './pages-zh/troubleshooting-zh.json';
import faqZh from './pages-zh/faq-zh.json';

// 合并所有页面翻译
const zhPages = {
  ...gettingStartedZh,
  ...conceptsZh,
  ...workflowsZh,
  ...installationZh,
  ...uiZh,
  ...serverActionsZh,
  ...stateZh,
  ...aiZh,
  ...databaseZh,
  ...troubleshootingZh,
  ...faqZh,
};

// 导入拆分后的英文页面文件
import gettingStartedEn from './pages-en/gettingStarted-en.json';
import conceptsEn from './pages-en/concepts-en.json';
import workflowsEn from './pages-en/workflows-en.json';
import installationEn from './pages-en/installation-en.json';
import uiEn from './pages-en/ui-en.json';
import serverActionsEn from './pages-en/serverActions-en.json';
import stateEn from './pages-en/state-en.json';
import aiEn from './pages-en/ai-en.json';
import databaseEn from './pages-en/database-en.json';
import troubleshootingEn from './pages-en/troubleshooting-en.json';
import faqEn from './pages-en/faq-en.json';

// 合并所有英文页面翻译
const enPages = {
  ...gettingStartedEn,
  ...conceptsEn,
  ...workflowsEn,
  ...installationEn,
  ...uiEn,
  ...serverActionsEn,
  ...stateEn,
  ...aiEn,
  ...databaseEn,
  ...troubleshootingEn,
  ...faqEn,
};

export type DocsTranslations = typeof zhDocs;
export type PagesTranslations = typeof zhPages;

/**
 * 获取文档的国际化内容
 */
export async function getDocsTranslations(): Promise<DocsTranslations> {
  const locale = await getLocale();
  
  if (locale === 'en') {
    return enDocs as DocsTranslations;
  }
  
  return zhDocs;
}

/**
 * 获取页面的国际化内容
 */
export async function getPageTranslations(): Promise<PagesTranslations> {
  const locale = await getLocale();
  
  if (locale === 'en') {
    // 英文版本部分页面内容可能不完整，使用类型断言
    return enPages as unknown as PagesTranslations;
  }
  
  return zhPages;
}

/**
 * 获取指定路径的翻译内容
 */
export function getDocsT(translations: DocsTranslations) {
  return function t(path: string): string {
    const keys = path.split('.');
    let result: unknown = translations;
    
    for (const key of keys) {
      if (result && typeof result === 'object' && key in result) {
        result = (result as Record<string, unknown>)[key];
      } else {
        return path; // 返回原始路径作为后备
      }
    }
    
    return typeof result === 'string' ? result : path;
  };
}

/**
 * 获取页面翻译函数
 */
export function getPageT(translations: PagesTranslations) {
  return function t(path: string): string {
    const keys = path.split('.');
    let result: unknown = translations;
    
    for (const key of keys) {
      if (result && typeof result === 'object' && key in result) {
        result = (result as Record<string, unknown>)[key];
      } else {
        return path; // 返回原始路径作为后备
      }
    }
    
    return typeof result === 'string' ? result : path;
  };
}

