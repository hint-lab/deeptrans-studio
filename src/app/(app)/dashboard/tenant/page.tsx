import { auth } from '@/auth';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ensureUserTenant } from '@/lib/user-tenant';
import { prisma } from '@/lib/db';
import { BookAIcon, DatabaseIcon, FolderIcon, ShieldCheckIcon, UsersRoundIcon } from 'lucide-react';
import { redirect } from 'next/navigation';

type TenantMember = {
    id: string;
    name: string | null;
    email: string | null;
    role: string;
};

type TenantProject = {
    id: string;
    name: string;
    domain: string;
    sourceLanguage: string;
    targetLanguage: string;
    date: Date;
};

function formatDate(date: Date) {
    return new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}

export default async function TenantManagementPage() {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
        redirect('/auth/login?callbackUrl=/dashboard/tenant');
    }

    const tenantId = await ensureUserTenant(userId);
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        include: {
            users: {
                orderBy: [{ role: 'asc' }, { email: 'asc' }],
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                },
            },
            projects: {
                orderBy: { date: 'desc' },
                take: 6,
                select: {
                    id: true,
                    name: true,
                    domain: true,
                    sourceLanguage: true,
                    targetLanguage: true,
                    date: true,
                },
            },
            _count: {
                select: {
                    users: true,
                    projects: true,
                    dictionaries: true,
                    translationMemories: true,
                },
            },
        },
    });

    if (!tenant) {
        redirect('/dashboard');
    }

    const members = tenant.users as TenantMember[];
    const projects = tenant.projects as TenantProject[];
    const counters = [
        {
            label: '成员',
            value: tenant._count.users,
            icon: UsersRoundIcon,
        },
        {
            label: '项目',
            value: tenant._count.projects,
            icon: FolderIcon,
        },
        {
            label: '词库',
            value: tenant._count.dictionaries,
            icon: BookAIcon,
        },
        {
            label: '翻译记忆',
            value: tenant._count.translationMemories,
            icon: DatabaseIcon,
        },
    ];

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-2 pb-10">
            <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                        租户管理
                    </h1>
                    <Badge variant="secondary" className="gap-1">
                        <ShieldCheckIcon className="h-3.5 w-3.5" />
                        当前工作区
                    </Badge>
                </div>
                <p className="max-w-3xl text-sm text-muted-foreground">
                    当前租户的成员、项目、词库和翻译记忆归属。
                </p>
            </div>

            <Card className="rounded-lg shadow-sm">
                <CardHeader className="pb-4">
                    <CardTitle className="text-xl">{tenant.name}</CardTitle>
                    <CardDescription>{tenant.description || '当前账号绑定的默认租户'}</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {counters.map(item => {
                            const Icon = item.icon;
                            return (
                                <div
                                    key={item.label}
                                    className="rounded-md border bg-muted/30 px-4 py-3"
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-sm text-muted-foreground">
                                            {item.label}
                                        </span>
                                        <Icon className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                    <div className="mt-2 text-2xl font-semibold tabular-nums">
                                        {item.value}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
                <Card className="rounded-lg shadow-sm">
                    <CardHeader>
                        <CardTitle>成员</CardTitle>
                        <CardDescription>当前租户下可访问共享资源的账号。</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {members.map(member => (
                            <div key={member.id} className="flex items-center justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="truncate text-sm font-medium">
                                        {member.name || member.email || '未命名用户'}
                                    </div>
                                    <div className="truncate text-xs text-muted-foreground">
                                        {member.email || member.id}
                                    </div>
                                </div>
                                <Badge
                                    variant={member.role === 'ADMIN' ? 'default' : 'outline'}
                                    className="shrink-0"
                                >
                                    {member.role === 'ADMIN' ? '管理员' : '成员'}
                                </Badge>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                <Card className="rounded-lg shadow-sm">
                    <CardHeader>
                        <CardTitle>最近项目</CardTitle>
                        <CardDescription>按项目日期排序的租户项目概览。</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {projects.length === 0 ? (
                            <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                                当前租户还没有项目。
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {projects.map((project, index) => (
                                    <div key={project.id}>
                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-medium">
                                                    {project.name}
                                                </div>
                                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                                    <span>{project.domain}</span>
                                                    <span>
                                                        {project.sourceLanguage} →{' '}
                                                        {project.targetLanguage}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {formatDate(project.date)}
                                            </div>
                                        </div>
                                        {index < projects.length - 1 && <Separator className="mt-4" />}
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
