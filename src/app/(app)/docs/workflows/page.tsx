import { Workflow } from "lucide-react";
import { getPageTranslations, getPageT } from "../i18n";

export default async function WorkflowsPage() {
  const translations = await getPageTranslations();
  const t = getPageT(translations);
  const page = translations.workflows;
  
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Workflow className="h-8 w-8 text-primary" />
        <h1 className="scroll-m-20 text-4xl font-bold tracking-tight">{t('workflows.title')}</h1>
      </div>
      <p className="text-sm text-muted-foreground">{t('workflows.subtitle')}</p>
      <ul className="list-disc space-y-2 pl-6 text-sm">
        {page.items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
