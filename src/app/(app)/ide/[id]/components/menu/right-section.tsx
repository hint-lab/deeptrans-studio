// 右侧部分：包含主题切换、帮助、通知、用户信息等
import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { ThemeToggle } from "./components/theme-toggle";
import { NotificationButton } from "./components/notification-button";
import { UserNavDropDown } from "./components/user-nav-dropdown";
import LocaleSwitcher from "@/components/locale-switcher";

export function RightSection() {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);




    return (
        <div className="flex items-center text-foreground">
            {/* 阶段按钮已移至阶段徽章右侧，此处移除以避免重复 */}
            <LocaleSwitcher iconOnly={true} />
            <ThemeToggle theme={theme} setTheme={setTheme} mounted={mounted} />
            <NotificationButton />
            <UserNavDropDown />
        </div>
    );
} 