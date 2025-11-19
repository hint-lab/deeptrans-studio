import { Button } from "@/components/ui/button";
import { HelpCircle } from "lucide-react";
import { useRightPanel } from "@/hooks/useRightPanel";
import { useTranslations } from 'next-intl';

export function HelpButton() {
    const t = useTranslations('IDE.menus.help');
    const { mode, toggleHelpMode } = useRightPanel() as any;
    return (
        <Button
            variant="ghost"
            size="sm"
            aria-label={t('label')}
            className={`${mode === 'help' ? 'bg-accent text-accent-foreground' : ''}`}
            onClick={() => toggleHelpMode()}
        >
            <HelpCircle size={16} />
        </Button>
    );
}

export default HelpButton;


