// 主菜单组件
import { Menubar } from '@/components/ui/menubar';
import { LeftSection } from './left-section';
import { LanguageSection } from './language-section';
import { ActionSection } from './action-section';
import { RightSection } from './right-section';

export function Menu() {
    return (
        <div className="z-50 flex items-center justify-between">
            <Menubar className="flex h-10 w-full items-center justify-between space-x-1 rounded-none border-b border-none text-sm text-foreground md:space-x-2">
                <LeftSection />
                <LanguageSection />
                <ActionSection />
                <RightSection />
            </Menubar>
        </div>
    );
}
