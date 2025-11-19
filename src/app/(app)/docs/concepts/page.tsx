import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BookOpen,
  FolderOpen,
  FileText,
  Type,
  Workflow,
  Database
} from "lucide-react";
import { getPageTranslations, getPageT } from "../i18n";

export default async function ConceptsPage() {
  const translations = await getPageTranslations();
  const t = getPageT(translations);
  const page = translations.concepts;
  
  const conceptIcons: Record<string, React.ComponentType<{ className?: string }>> = {
    project: FolderOpen,
    document: FileText,
    segment: Type,
    terminology: BookOpen,
    memory: Database,
    workflow: Workflow
  };
  
  const conceptColors: Record<string, string> = {
    project: "bg-blue-100 text-blue-600",
    document: "bg-green-100 text-green-600",
    segment: "bg-purple-100 text-purple-600",
    terminology: "bg-orange-100 text-orange-600",
    memory: "bg-pink-100 text-pink-600",
    workflow: "bg-indigo-100 text-indigo-600"
  };
  
  return (
    <div className="space-y-8">
      {/* 页面标题 */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <BookOpen className="h-8 w-8 text-purple-600" />
          <h1 className="scroll-m-20 text-4xl font-bold tracking-tight">{t('concepts.title')}</h1>
        </div>
        <p className="text-lg text-muted-foreground max-w-3xl">
          {t('concepts.subtitle')}
        </p>
      </div>

      {/* 数据层次结构 */}
      <div className="space-y-6">
        <h2 className="text-2xl font-bold tracking-tight">{t('concepts.hierarchyTitle')}</h2>

        <div className="grid gap-6">
          {Object.entries(page.concepts).map(([key, concept]) => {
            const Icon = conceptIcons[key] ?? BookOpen;
            const colorClass = conceptColors[key] ?? "bg-gray-100 text-gray-600";
            
            return (
              <Card key={key}>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full ${colorClass}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">{concept.title}</CardTitle>
                      <CardDescription>{concept.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* 图片展示 */}
                    {(() => {
                      type ConceptWithImage = typeof concept & { image?: string };
                      const conceptWithImage = concept as ConceptWithImage;
                      const imageUrl = conceptWithImage?.image;
                      return imageUrl?.trim() ? (
                        <div className="relative w-full rounded-lg border border-border overflow-auto bg-muted/50 shadow-sm">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={imageUrl}
                            alt={concept.title}
                            className="block"
                            style={{ 
                              width: '100%',
                              height: 'auto',
                              maxWidth: '100%',
                              display: 'block',
                              imageRendering: 'auto'
                            } as React.CSSProperties}
                            loading="lazy"
                            decoding="sync"
                          />
                        </div>
                      ) : null;
                    })()}
                    {/* 详细信息 */}
                    <ul className="space-y-2">
                      {concept.details.map((detail, index) => (
                        <li key={index} className="flex items-start gap-2 text-sm">
                          <span className="text-primary mt-0.5">•</span>
                          <span className="text-muted-foreground">{detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
