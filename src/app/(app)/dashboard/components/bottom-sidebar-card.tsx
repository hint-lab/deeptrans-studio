import { Card, CardContent, CardHeader, CardTitle } from 'src/components/ui/card';
import { Progress } from 'src/components/ui/progress';
import { ChevronRight } from 'lucide-react';
import { Button } from 'src/components/ui/button';
import { useTranslations } from 'next-intl';

export default function BottomSidebarCard() {
    const t = useTranslations('Dashboard.Upgrade');
    return (
        <div className="flex size-full flex-col items-center justify-center px-8">
            <Card className="size-full">
                <CardHeader className="flex flex-row items-center justify-between space-y-1 p-2">
                    <CardTitle className="text-sm font-medium">{t('freeVersion')}</CardTitle>{' '}
                    <ChevronRight />
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col gap-1">
                        <Progress value={30} className="w-[100%]" />
                        <p className="text-xs text-muted-foreground">{t('wantMoreProjects')}</p>
                        <Button variant="default" size="sm">
                            {t('upgrade')}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
