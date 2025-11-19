import { Code, AlertCircle, Globe, Key, Network, FileText } from "lucide-react";
import { getPageTranslations, getPageT } from "../i18n";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeBlock } from "../components/code-block";
import { Badge } from "@/components/ui/badge";

export default async function ServerActionsPage() {
  const translations = await getPageTranslations();
  const t = getPageT(translations);
  const page = translations.serverActions;
  
  return (
    <div className="space-y-8">
      {/* 页面标题 */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Code className="h-8 w-8 text-primary" />
          <h1 id="Server Actions API" className="scroll-m-20 text-4xl font-bold tracking-tight">{t('serverActions.title')}</h1>
        </div>
        <p className="text-lg text-muted-foreground leading-7">
          {t('serverActions.subtitle')}
        </p>
      </div>

      {/* 重要提示 */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="space-y-2">
          <div className="font-semibold">{page.importantNote.title}</div>
          <ul className="list-disc space-y-1 pl-6 text-sm">
            {page.importantNote.content.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </AlertDescription>
      </Alert>

      {/* API 端点列表 - 放在前面 */}
      <div className="space-y-6">
        <h2 id="API 端点" className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Network className="h-6 w-6" />
          {page.apiEndpoints.title}
        </h2>
        <p className="text-muted-foreground leading-7">
          {page.apiEndpoints.description}
        </p>

        <div className="space-y-8">
          {page.apiEndpoints.categories.map((category, categoryIndex) => (
            <div key={categoryIndex} className="space-y-4">
              <div className="space-y-2">
                <h3 id={category.name} className="text-xl font-semibold scroll-m-20">
                  {category.name}
                </h3>
                <p className="text-sm text-muted-foreground">{category.description}</p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {category.endpoints.map((endpoint, endpointIndex) => {
                  const methodColors: Record<string, string> = {
                    'GET': 'bg-blue-100 text-blue-700 border-blue-200',
                    'POST': 'bg-green-100 text-green-700 border-green-200',
                    'PUT': 'bg-yellow-100 text-yellow-700 border-yellow-200',
                    'DELETE': 'bg-red-100 text-red-700 border-red-200',
                    'PATCH': 'bg-purple-100 text-purple-700 border-purple-200',
                  };
                  const methodParts = endpoint.method.split('/');
                  const methodKey = methodParts[0];
                  const methodColor = methodKey && methodKey in methodColors 
                    ? methodColors[methodKey] 
                    : 'bg-gray-100 text-gray-700 border-gray-200';

                  return (
                    <Card key={endpointIndex} className="hover:shadow-md transition-shadow">
                      <CardHeader className="pb-3">
                        <div className="flex items-start gap-2 flex-wrap">
                          <Badge variant="outline" className={methodColor}>
                            {endpoint.method}
                          </Badge>
                          <code className="text-xs font-mono bg-muted px-2 py-1 rounded flex-1 min-w-0 break-all">
                            {endpoint.path}
                          </code>
                        </div>
                        <CardTitle className="text-base mt-2">{endpoint.title}</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <CardDescription className="text-sm leading-6">
                          {endpoint.description}
                        </CardDescription>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* API 访问配置 */}
      <div className="space-y-6">
        <h2 id="API 访问配置" className="text-2xl font-bold tracking-tight">{page.apiConfig.title}</h2>
        
        {/* 服务器地址 */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold flex items-center gap-2">
            <Globe className="h-5 w-5" />
            {page.apiConfig.baseUrl.title}
          </h3>
          <p className="text-muted-foreground leading-7">
            {page.apiConfig.baseUrl.description}
          </p>
          
          <div className="space-y-2">
            {page.apiConfig.baseUrl.options.map((option, index) => (
              <div key={index} className="space-y-1">
                <div className="font-medium">{option.name}</div>
                <CodeBlock code={option.code} language="text" />
              </div>
            ))}
          </div>
          
          <p className="text-sm text-muted-foreground italic">
            {page.apiConfig.baseUrl.note}
          </p>
        </div>

        {/* 认证信息 */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold flex items-center gap-2">
            <Key className="h-5 w-5" />
            {page.apiConfig.authentication.title}
          </h3>
          <p className="text-muted-foreground leading-7">
            {page.apiConfig.authentication.description}
          </p>
          
          <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
            {page.apiConfig.authentication.methods.map((method, index) => (
              <li key={index} className="leading-7">{method}</li>
            ))}
          </ul>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="space-y-2">
              <div className="font-semibold">{page.apiConfig.authentication.securityNote.title}</div>
              <ul className="list-disc space-y-1 pl-6 text-sm">
                {page.apiConfig.authentication.securityNote.content.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        </div>
      </div>

      {/* 关于文档 */}
      <div className="space-y-6">
        <h2 id="关于文档" className="text-2xl font-bold tracking-tight">{page.aboutDocs.title}</h2>
        
        {/* 文档的组成与来源 */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold">{page.aboutDocs.composition.title}</h3>
          <div className="grid gap-4 md:grid-cols-2">
            {page.aboutDocs.composition.items.map((item, index) => (
              <Card key={index}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    {item.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="leading-6">{item.description}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
