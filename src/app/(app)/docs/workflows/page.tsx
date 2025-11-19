import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Workflow, Zap, Shield, Edit } from "lucide-react";
import { getPageTranslations, getPageT } from "../i18n";

export default async function WorkflowsPage() {
  const translations = await getPageTranslations();
  const t = getPageT(translations);
  const page = translations.workflows;
  
  return (
    <div className="space-y-8">
      {/* 页面标题 */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Workflow className="h-8 w-8 text-primary" />
          <h1 id="工作流" className="scroll-m-20 text-4xl font-bold tracking-tight">{t('workflows.title')}</h1>
        </div>
        <p className="text-lg text-muted-foreground">
          {t('workflows.subtitle')}
        </p>
      </div>

      {/* 基本介绍 */}
      {page.introduction && (
        <div className="space-y-4">
          <h2 id="基本介绍" className="text-2xl font-bold tracking-tight">{page.introduction.title}</h2>
          <p className="text-muted-foreground leading-7">
            {page.introduction.description}
          </p>

          {/* 工作流类型 */}
          {page.introduction.types && (
            <div className="space-y-4 mt-6">
              <h3 className="text-xl font-semibold">{page.introduction.types.title}</h3>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                    <Zap className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-lg">{page.introduction.types.preTranslate.name}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>{page.introduction.types.preTranslate.description}</CardDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-600">
                    <Shield className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-lg">{page.introduction.types.qualityAssurance.name}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>{page.introduction.types.qualityAssurance.description}</CardDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 text-purple-600">
                    <Edit className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-lg">{page.introduction.types.postEdit.name}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>{page.introduction.types.postEdit.description}</CardDescription>
              </CardContent>
            </Card>
          </div>
            </div>
          )}
          {/* 工作流图片 */}
          {(() => {
            type PageWithImage = typeof page & { image?: string };
            const pageWithImage = page as PageWithImage;
            const imageUrl = pageWithImage?.image;
            return imageUrl && typeof imageUrl === "string" && imageUrl.trim() ? (
              <div className="relative w-full rounded-lg border border-border overflow-auto bg-muted/50 shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt={t('workflows.title')}
                  className="block"
                  style={{ 
                    width: '100%',
                    height: 'auto',
                    maxWidth: '100%',
                    display: 'block',
                    imageRendering: 'auto'
                  } as React.CSSProperties}
                  loading="eager"
                  decoding="sync"
                />
              </div>
            ) : null;
          })()}
        </div>
      )}

      {/* 核心特性 */}
      <div className="space-y-4">
        <h2 id="核心特性" className="text-2xl font-bold tracking-tight">{page.features.title}</h2>
        <ul className="space-y-2 pl-6 list-disc text-muted-foreground">
          {page.features.items.map((item, index) => (
            <li key={index} className="leading-7">{item}</li>
          ))}
        </ul>
      </div>

      {/* 常见案例 */}
      <div className="space-y-4">
        <h2 id="常见案例" className="text-2xl font-bold tracking-tight">{page.useCases.title}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {page.useCases.cases.map((useCase, index) => (
            <Card key={index}>
              <CardHeader>
                <CardTitle className="text-lg">{useCase.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="leading-6">{useCase.description}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* 如何开始 */}
      <div className="space-y-4">
        <h2 id="如何开始" className="text-2xl font-bold tracking-tight">{page.gettingStarted.title}</h2>
        <div className="space-y-3">
          {page.gettingStarted.steps.map((step, index) => (
            <Card key={index}>
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold shrink-0">
                    {index + 1}
                  </div>
                  <p className="text-muted-foreground leading-7 pt-1">{step}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
