import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Settings,
  CheckCircle,
  ArrowRight,
  AlertCircle,
  Database,
  Dock,
  Package,
  FileText,
  PlayCircle,
  ListChecks
} from "lucide-react";
import { getPageTranslations, getPageT } from "../i18n";
import { CodeBlock } from "../components/code-block";

export default async function InstallationPage() {
  const translations = await getPageTranslations();
  const t = getPageT(translations);
  const page = translations.installation;
  
  return (
    <div className="space-y-8">
      {/* 页面标题 */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Settings className="h-8 w-8 text-blue-600" />
          <h1 className="scroll-m-20 text-4xl font-bold tracking-tight">{t('installation.title')}</h1>
        </div>
        <p className="text-lg text-muted-foreground">
          {t('installation.subtitle')}
        </p>
      </div>

      {/* 前置要求 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <ListChecks className="h-5 w-5 text-primary" />
            <CardTitle className="text-xl">{page.prerequisites.title}</CardTitle>
          </div>
          <CardDescription className="mt-2">{page.prerequisites.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {page.prerequisites.items.map((item, index) => (
              <li key={index} className="flex items-start gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <span className="text-muted-foreground">{item}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* 安装依赖 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600 font-semibold">
              1
            </div>
            <div className="flex-1">
              <CardTitle className="text-xl">{page.installDeps.title}</CardTitle>
              <CardDescription className="mt-1">{page.installDeps.description}</CardDescription>
            </div>
            <Package className="h-5 w-5 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <CodeBlock code={page.installDeps.commands.enableCorepack} language="bash" />
            <CodeBlock code={page.installDeps.commands.prepareYarn} language="bash" />
            <CodeBlock code={page.installDeps.commands.install} language="bash" />
          </div>
        </CardContent>
      </Card>

      {/* 配置环境变量 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600 font-semibold">
              2
            </div>
            <div className="flex-1">
              <CardTitle className="text-xl">{page.envConfig.title}</CardTitle>
              <CardDescription className="mt-1">{page.envConfig.description}</CardDescription>
            </div>
            <FileText className="h-5 w-5 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <CodeBlock code={page.envConfig.example} language="dotenv" />
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{page.envConfig.note}</AlertDescription>
            </Alert>
          </div>
        </CardContent>
      </Card>

      {/* 初始化数据库 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600 font-semibold">
              3
            </div>
            <div className="flex-1">
              <CardTitle className="text-xl">{page.initDb.title}</CardTitle>
              <CardDescription className="mt-1">{page.initDb.description}</CardDescription>
            </div>
            <Database className="h-5 w-5 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <CodeBlock code={page.initDb.commands.migrate} language="bash" />
            <CodeBlock code={page.initDb.commands.generate} language="bash" />
            <CodeBlock code={page.initDb.commands.seed} language="bash" />
          </div>
        </CardContent>
      </Card>

      {/* 启动本地开发环境 */}
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <PlayCircle className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold tracking-tight">{page.startDev.title}</h2>
        </div>
        <p className="text-muted-foreground">{page.startDev.description}</p>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{page.startDev.step1.title}</CardTitle>
            <CardDescription>{page.startDev.step1.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <CodeBlock code={page.startDev.step1.command} language="bash" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{page.startDev.step2.title}</CardTitle>
            <CardDescription>{page.startDev.step2.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <CodeBlock code={page.startDev.step2.command} language="bash" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{page.startDev.step3.title}</CardTitle>
            <CardDescription>{page.startDev.step3.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <CodeBlock code={page.startDev.step3.command} language="bash" />
              <p className="text-sm text-muted-foreground">{page.startDev.step3.note}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              {page.startDev.access.title}
            </CardTitle>
            <CardDescription>{page.startDev.access.description}</CardDescription>
          </CardHeader>
        </Card>
      </div>

      {/* 使用 Docker Compose 运行 */}
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Dock className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold tracking-tight">{page.dockerCompose.title}</h2>
        </div>
        <p className="text-muted-foreground">{page.dockerCompose.description}</p>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{page.dockerCompose.step1.title}</CardTitle>
            <CardDescription>{page.dockerCompose.step1.description}</CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{page.dockerCompose.step2.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <CodeBlock code={page.dockerCompose.step2.command} language="bash" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{page.dockerCompose.step3.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <CodeBlock code={page.dockerCompose.step3.command} language="bash" />
              <p className="text-sm text-muted-foreground">{page.dockerCompose.step3.note}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 下一步 */}
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle>{page.nextSteps.title}</CardTitle>
          <CardDescription>{page.nextSteps.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <Link
              href="/docs/getting-started"
              className="flex items-center gap-2 text-sm hover:text-primary transition-colors"
            >
              <ArrowRight className="h-3 w-3" />
              {page.nextSteps.links.gettingStarted}
            </Link>
            <Link
              href="/docs/concepts"
              className="flex items-center gap-2 text-sm hover:text-primary transition-colors"
            >
              <ArrowRight className="h-3 w-3" />
              {page.nextSteps.links.concepts}
            </Link>
            <Link
              href="/docs/workflows"
              className="flex items-center gap-2 text-sm hover:text-primary transition-colors"
            >
              <ArrowRight className="h-3 w-3" />
              {page.nextSteps.links.workflows}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
