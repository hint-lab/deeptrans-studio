// 左侧部分：包含侧边栏切换、Logo和基础菜单
import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { SidebarToggle } from "@/components/sidebar-toggle";
import { LogoMenu } from "./components/logo-menu";
import { EditMenu } from "./components/edit-menu";
import { ViewMenu } from "./components/view-menu";
import { ExportMenu } from "./components/export-menu";
import { SearchMenu } from "./components/search-menu";
import { useSidebar } from "@/hooks/useSidebar";
import { DashboardMenu } from "./components/dashboard-menu";
export function LeftSection() {
    const { isSidebarOpen, toggleSidebar } = useSidebar();
    const { theme, resolvedTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const [logoSrc, setLogoSrc] = useState("/logo3_dark.svg");


    // 确保只在客户端更新主题相关状态
    useEffect(() => {
        setMounted(true);
    }, []);

    // 只有在客户端渲染后才根据主题更新 logo
    useEffect(() => {
        if (mounted) {
            const isDark = resolvedTheme === "dark" || theme === "dark";
            setLogoSrc(isDark ? "/logo3_dark.svg" : "/logo3.svg");
        }
    }, [theme, resolvedTheme, mounted]);

    return (
        <div className="flex items-center justify-start w-full">
            <SidebarToggle isOpen={isSidebarOpen} onToggle={toggleSidebar} />
            <LogoMenu logoSrc={logoSrc} />
            <DashboardMenu />
            <EditMenu />
            <ViewMenu />
            <ExportMenu />
            {/* <SearchMenu /> */}
        </div>
    );
} 