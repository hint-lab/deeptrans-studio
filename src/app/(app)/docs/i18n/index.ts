import { getLocale } from 'next-intl/server';
import zhDocs from './zh.json';
import enDocs from './en.json';
import zhPages from './pages-zh.json';
import enPages from './pages-en.json';

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
    return enPages as PagesTranslations;
  }
  
  return zhPages;
}

/**
 * 获取指定路径的翻译内容
 */
export function getDocsT(translations: DocsTranslations) {
  return function t(path: string): string {
    const keys = path.split('.');
    let result: any = translations;
    
    for (const key of keys) {
      if (result && typeof result === 'object' && key in result) {
        result = result[key];
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
    let result: any = translations;
    
    for (const key of keys) {
      if (result && typeof result === 'object' && key in result) {
        result = result[key];
      } else {
        return path; // 返回原始路径作为后备
      }
    }
    
    return typeof result === 'string' ? result : path;
  };
}

