import Link from 'next/link'
import { Command, } from "lucide-react"
import { Button } from "src/components/ui/button"
import { useTranslations } from 'next-intl'
export default function Hello() {
    const t = useTranslations('IDE.hello');
    return (
        <div className="flex flex-row justify-center items-center mt-24 text-foreground">
            <div className="flex flex-col">
                <div className="text-center mb-3">
                    <div className="gradient-text text-4xl font-bold mb-4">{t('title')}</div>

                    <h1 className="mb-2">{t('subtitle')}</h1>
                    <p className="text-sm mb-4">{t('description')}</p>
                </div>
                <div className="flex items-center justify-center mt-4 space-y-4">
                    <div className="flex flex-col text-left justify-between space-y-2">
                        <div className="flex mx-auto">
                            <button className="gradient-text text-xl font-bold">{t('aiSidebarChat')}</button>
                        </div>
                        <div className="flex flex-row justify-start items-center gap-2">
                            <Button variant="ghost">{t('showAllCommands')}</Button> <Command size="16" />
                        </div>
                        <div className="flex  flex-row  justify-start items-center gap-2">
                            <Button variant="ghost">{t('goToFile')}</Button> <Command size="16" />
                        </div>
                        <div className="flex  flex-row  justify-start items-center gap-2">
                            <Button variant="ghost">{t('showSettings')}</Button> <Command size="16" />
                        </div>
                    </div>
                </div>
            </div>
        </div >
    )
}
