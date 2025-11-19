import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Zap,
  Upload,
  FileText,
  Settings,
  Play,
  CheckCircle,
  ArrowRight,
  AlertCircle
} from "lucide-react";
import { getPageTranslations, getPageT } from "../i18n";

export default async function GettingStartedPage() {
  const translations = await getPageTranslations();
  const t = getPageT(translations);
  const page = translations.gettingStarted;
  
  const stepIcons = [Settings, Upload, FileText, Play, CheckCircle, ArrowRight];
  
  return (
    <div className="space-y-8">
      {/* 页面标题 */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Zap className="h-8 w-8 text-green-600" />
          <h1 className="scroll-m-20 text-4xl font-bold tracking-tight">{t('gettingStarted.title')}</h1>
        </div>
        <p className="text-lg text-muted-foreground max-w-3xl">
          {t('gettingStarted.subtitle')}
        </p>
      </div>

      {/* 准备工作 */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {t('gettingStarted.alert')}
        </AlertDescription>
      </Alert>

      {/* 步骤指南 */}
      <div className="space-y-6">
        <h2 className="text-2xl font-bold tracking-tight">{t('gettingStarted.stepsTitle')}</h2>

        {Object.entries(page.steps).map(([key, step], index) => {
          const Icon = stepIcons[index] || Settings;
          return (
            <Card key={key}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600 font-semibold">
                    {step.number}
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-xl">{step.title}</CardTitle>
                    <CardDescription className="mt-1">{step.description}</CardDescription>
                  </div>
                  <Icon className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* 图片展示 */}
                  {step.image && (
                    <div className="relative w-full rounded-lg border border-border overflow-auto bg-muted/50 shadow-sm">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={step.image}
                        alt={step.title}
                        className="block"
                        style={{ 
                          width: '100%',
                          height: 'auto',
                          maxWidth: '100%',
                          display: 'block',
                          imageRendering: 'auto'
                        } as React.CSSProperties}
                        loading={index === 0 ? 'eager' : 'lazy'}
                        decoding="sync"
                      />
                    </div>
                  )}
                  {/* 提示信息 */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium">{t('gettingStarted.tipsLabel')}</p>
                    <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                      {step.tips.map((tip, i) => (
                        <li key={i}>{tip}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 下一步 */}
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle>{t('gettingStarted.nextSteps.title')}</CardTitle>
          <CardDescription>{t('gettingStarted.nextSteps.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <Link
              href="/docs/workflows"
              className="flex items-center gap-2 text-sm hover:text-primary transition-colors"
            >
              <ArrowRight className="h-3 w-3" />
              {page.nextSteps.links.workflows}
            </Link>
            <Link
              href="/docs/ai"
              className="flex items-center gap-2 text-sm hover:text-primary transition-colors"
            >
              <ArrowRight className="h-3 w-3" />
              {page.nextSteps.links.ai}
            </Link>
            <Link
              href="/docs/ui"
              className="flex items-center gap-2 text-sm hover:text-primary transition-colors"
            >
              <ArrowRight className="h-3 w-3" />
              {page.nextSteps.links.ui}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
