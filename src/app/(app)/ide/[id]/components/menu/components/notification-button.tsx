import { Button } from '@/components/ui/button';
import { Bell } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function NotificationButton() {
    const t = useTranslations('IDE.menus.notifications');
    return (
        <Button variant="ghost" size="sm" aria-label={t('label')}>
            <Bell size={16} />
        </Button>
    );
}
