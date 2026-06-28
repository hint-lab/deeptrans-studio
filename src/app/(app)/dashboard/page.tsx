'use client';
import type { NextPage } from 'next';
import { useSession } from "next-auth/react";
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef } from "react";
import { toast } from 'sonner';
import ProjectListPage from './projects/page';
const DashboardPage: NextPage = () => {
    const params = useSearchParams();
    const { update } = useSession();
    const hasUpdatedRef = useRef(false); // 使用 ref 记录是否已更新
    useEffect(() => {
        // 只在页面首次加载完成时执行一次
        if (!hasUpdatedRef.current) {
            hasUpdatedRef.current = true; // 标记为已更新

            update().catch(() => {});
        }
    }, [update]);
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
