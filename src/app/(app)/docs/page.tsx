import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen,
  Zap,
  Settings,
  Users,
  ChevronRight,
  FileText,
  Workflow,
  MessageSquare,
  Shield,
  Database,
  Bot
} from "lucide-react";
import { getDocsTranslations, getDocsT } from "./i18n";
import logger from "@/lib/logger";

export default async function DocsHomePage() {
  const translations = await getDocsTranslations();
  const t = getDocsT(translations);
  // 页面渲染开始日志
  logger.info({ event: 'page_render_start' }, 'Docs page rendering started');
  try {
    return (
      <div className="space-y-8">
        {/* 页面标题 */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-8 w-8 text-primary" />
            <h1 className="scroll-m-20 text-4xl font-bold tracking-tight">{t('home.title')}</h1>
          </div>
          <p className="text-lg text-muted-foreground max-w-3xl">
            {t('home.subtitle')}
          </p>
        </div>

        {/* 快速导航卡片 */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
          <Card className="group hover:shadow-lg transition-shadow cursor-pointer min-h-44">
            <Link href="/docs/getting-started">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-green-600" />
                  <CardTitle className="text-lg whitespace-nowrap">{t('home.cards.gettingStarted.title')}</CardTitle>
                  <ChevronRight className="h-4 w-4 ml-auto group-hover:translate-x-1 transition-transform" />
                </div>
                <CardDescription>
                  {t('home.cards.gettingStarted.description')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1">
                  {translations.home.cards.gettingStarted.badges.map((badge) => (
                    <Badge key={badge} variant="outline">{badge}</Badge>
                  ))}
                </div>
              </CardContent>
            </Link>
          </Card>

          <Card className="group hover:shadow-lg transition-shadow cursor-pointer min-h-44">
            <Link href="/docs/workflows">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Workflow className="h-5 w-5 text-blue-600" />
                  <CardTitle className="text-lg whitespace-nowrap">{t('home.cards.workflows.title')}</CardTitle>
                  <ChevronRight className="h-4 w-4 ml-auto group-hover:translate-x-1 transition-transform" />
                </div>
                <CardDescription>
                  {t('home.cards.workflows.description')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1">
                  {translations.home.cards.workflows.badges.map((badge) => (
                    <Badge key={badge} variant="outline">{badge}</Badge>
                  ))}
                </div>
              </CardContent>
            </Link>
          </Card>

          <Card className="group hover:shadow-lg transition-shadow cursor-pointer min-h-44">
            <Link href="/docs/concepts">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Settings className="h-5 w-5 text-purple-600" />
                  <CardTitle className="text-lg whitespace-nowrap">{t('home.cards.concepts.title')}</CardTitle>
                  <ChevronRight className="h-4 w-4 ml-auto group-hover:translate-x-1 transition-transform" />
                </div>
                <CardDescription>
                  {t('home.cards.concepts.description')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1">
                  {translations.home.cards.concepts.badges.map((badge) => (
                    <Badge key={badge} variant="outline">{badge}</Badge>
                  ))}
                </div>
              </CardContent>
            </Link>
          </Card>

          <Card className="group hover:shadow-lg transition-shadow cursor-pointer min-h-44">
            <Link href="/docs/ai">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-orange-600" />
                  <CardTitle className="text-lg whitespace-nowrap">{t('home.cards.ai.title')}</CardTitle>
                  <ChevronRight className="h-4 w-4 ml-auto group-hover:translate-x-1 transition-transform" />
                </div>
                <CardDescription>
                  {t('home.cards.ai.description')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1">
                  {translations.home.cards.ai.badges.map((badge) => (
                    <Badge key={badge} variant="outline">{badge}</Badge>
                  ))}
                </div>
              </CardContent>
            </Link>
          </Card>

          <Card className="group hover:shadow-lg transition-shadow cursor-pointer min-h-44">
            <Link href="/docs/ui">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-indigo-600" />
                  <CardTitle className="text-lg whitespace-nowrap">{t('home.cards.ui.title')}</CardTitle>
                  <ChevronRight className="h-4 w-4 ml-auto group-hover:translate-x-1 transition-transform" />
                </div>
                <CardDescription>
                  {t('home.cards.ui.description')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1">
                  {translations.home.cards.ui.badges.map((badge) => (
                    <Badge key={badge} variant="outline">{badge}</Badge>
                  ))}
                </div>
              </CardContent>
            </Link>
          </Card>

          <Card className="group hover:shadow-lg transition-shadow cursor-pointer min-h-44">
            <Link href="/docs/troubleshooting">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-red-600" />
                  <CardTitle className="text-lg whitespace-nowrap">{t('home.cards.troubleshooting.title')}</CardTitle>
                  <ChevronRight className="h-4 w-4 ml-auto group-hover:translate-x-1 transition-transform" />
                </div>
                <CardDescription>
                  {t('home.cards.troubleshooting.description')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1">
                  {translations.home.cards.troubleshooting.badges.map((badge) => (
                    <Badge key={badge} variant="outline">{badge}</Badge>
                  ))}
                </div>
              </CardContent>
            </Link>
          </Card>
        </div>

        {/* 特色功能介绍 */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold tracking-tight">{t('home.features.title')}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500"></div>
                <h3 className="font-semibold">{t('home.features.items.workflow.title')}</h3>
              </div>
              <p className="text-sm text-muted-foreground pl-4">
                {t('home.features.items.workflow.description')}
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                <h3 className="font-semibold">{t('home.features.items.collaboration.title')}</h3>
              </div>
              <p className="text-sm text-muted-foreground pl-4">
                {t('home.features.items.collaboration.description')}
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-purple-500"></div>
                <h3 className="font-semibold">{t('home.features.items.quality.title')}</h3>
              </div>
              <p className="text-sm text-muted-foreground pl-4">
                {t('home.features.items.quality.description')}
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-orange-500"></div>
                <h3 className="font-semibold">{t('home.features.items.management.title')}</h3>
              </div>
              <p className="text-sm text-muted-foreground pl-4">
                {t('home.features.items.management.description')}
              </p>
            </div>
          </div>
        </div>

        {/* 快速链接 */}
        <div className="rounded-lg border bg-muted/50 p-6">
          <h2 className="font-semibold mb-4">{t('home.quickLinks.title')}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Link
              href="/docs/installation"
              className="flex items-center gap-2 text-sm hover:text-primary transition-colors"
            >
              <ChevronRight className="h-3 w-3" />
              {t('home.quickLinks.installation')}
            </Link>
            <Link
              href="/docs/faq"
              className="flex items-center gap-2 text-sm hover:text-primary transition-colors"
            >
              <ChevronRight className="h-3 w-3" />
              {t('home.quickLinks.faq')}
            </Link>
            <Link
              href="/docs/server-actions"
              className="flex items-center gap-2 text-sm hover:text-primary transition-colors"
            >
              <ChevronRight className="h-3 w-3" />
              {t('home.quickLinks.api')}
            </Link>
            <Link
              href="/docs/database"
              className="flex items-center gap-2 text-sm hover:text-primary transition-colors"
            >
              <ChevronRight className="h-3 w-3" />
              {t('home.quickLinks.database')}
            </Link>
          </div>
        </div>
      </div>
    );
    // 这里可以添加更多的日志记录点
  } catch (error) {
// 错误日志（包含堆栈信息）
    logger.error(
      { 
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined 
      }, 
      'Failed to render Docs page'
    );    
    // 重定向到错误页面
    throw error;
  } finally {
    logger.info({ event: 'page_render_end' }, 'Docs page rendering ended');
  }
}

