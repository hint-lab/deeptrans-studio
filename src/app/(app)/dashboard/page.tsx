'use client';
import { createLogger } from '@/lib/logger';
import type { NextPage } from 'next';
import { useSession } from "next-auth/react";
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef } from "react";
import { toast } from 'sonner';
import ProjectListPage from './projects/page';
const logger = createLogger({
    type: 'app:dashboard',
}, {
    json: false,// 开启json格式输出
    pretty: false, // 关闭开发环境美化输出
    colors: true, // 仅当json：false时启用颜色输出可用
    includeCaller: false, // 日志不包含调用者
});
const DashboardPage: NextPage = () => {
    const params = useSearchParams();
    const { data: session, status, update } = useSession();
    const hasUpdatedRef = useRef(false); // 使用 ref 记录是否已更新
    useEffect(() => {
        // 只在页面首次加载完成时执行一次
        if (!hasUpdatedRef.current) {
            hasUpdatedRef.current = true; // 标记为已更新

            update().then(updatedSession => {
                logger.info("Dashboard 页面首次加载，已更新 session");
            }).catch(error => {
                logger.error("Dashboard 页面 session 更新失败:", error);
            });
        }
    }, [session, update]); // 依赖 session 和 update
    useEffect(() => {
        const notice = params.get('notice');
        if (notice === 'processing') {
            toast.info('文档解析中，稍后再试');
        } else if (notice === 'nodoc') {
            toast.info('该项目尚无文档');
        }
    }, [params]);
    return <ProjectListPage />;


};
export default DashboardPage;
