'use client';
import type { NextPage } from 'next';
import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from 'sonner';
import ProjectListPage from './projects/page';
const DashboardPage: NextPage = () => {
    const params = useSearchParams();
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
