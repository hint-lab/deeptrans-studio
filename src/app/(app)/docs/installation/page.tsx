import { Settings } from "lucide-react";
import { getPageTranslations, getPageT } from "../i18n";

export default async function InstallationPage() {
  const translations = await getPageTranslations();
  const t = getPageT(translations);
  
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Settings className="h-8 w-8 text-primary" />
        <h1 className="scroll-m-20 text-4xl font-bold tracking-tight">{t('installation.title')}</h1>
      </div>
      <p className="text-lg text-muted-foreground">{t('installation.subtitle')}</p>
    </div>
  );
}
