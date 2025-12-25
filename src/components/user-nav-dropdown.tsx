'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuShortcut,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AVATARS } from '@/constants/avatars';
import { useTranslations } from 'next-intl';

export function UnifiedUserNavDropDown({
    size = 'md',
    redirectPath = '/',
}: {
    size?: 'sm' | 'md';
    redirectPath?: string;
}) {
    const t = useTranslations('Common');
    const router = useRouter();
    const { data: session } = useSession();

    const storageKey = useMemo(() => {
        const uid = session?.user?.id || 'default';
        return `avatar:${uid}`;
    }, [session?.user?.id]);

    const [avatar, setAvatar] = useState<string>(AVATARS[1] || '');

    useEffect(() => {
        try {
            const saved =
                typeof window !== 'undefined' ? window.localStorage.getItem(storageKey) : null;
            if (typeof saved === 'string' && AVATARS.includes(saved)) setAvatar(saved);
            else setAvatar(AVATARS[1] || '');
        } catch {}
    }, [storageKey]);

    const handlePick = (url: string) => {
        try {
            setAvatar(url);
            if (typeof window !== 'undefined') window.localStorage.setItem(storageKey, url);
        } catch {}
    };

    const avatarSizeCls = size === 'sm' ? 'h-6 w-6' : 'h-8 w-8';

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative rounded-full">
                    <Avatar className={avatarSizeCls}>
                        <AvatarImage src={avatar} alt="User" />
                        <AvatarFallback>{session?.user?.name}</AvatarFallback>
                    </Avatar>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-80" align="end" forceMount>
                <DropdownMenuLabel className="text-light">
                    <div className="flex flex-col space-y-1">
                        <p className="text-xs font-medium leading-none">
                            {session?.user?.name ?? ''}
                        </p>
                        <p className="text-xs leading-none text-muted-foreground">
                            {session?.user?.email ?? ''}
                        </p>
                    </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="px-3 py-2">
                    <div className="mb-2 text-[11px] text-foreground/60">选择头像</div>
                    <div className="grid grid-cols-6 gap-2">
                        {AVATARS.map(url => (
                            <button
                                key={url}
                                type="button"
                                onClick={() => handlePick(url)}
                                className={`rounded border ${avatar === url ? 'border-blue-500' : 'border-transparent'} p-0.5 hover:border-blue-400`}
                                aria-label={t('selectAvatar')}
                            >
                                <Avatar className="h-8 w-8">
                                    <AvatarImage src={url} alt="avatar" />
                                    <AvatarFallback>U</AvatarFallback>
                                </Avatar>
                            </button>
                        ))}
                    </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    onClick={() => {
                        // Let NextAuth handle redirect after sign out
                        signOut({ callbackUrl: '/' });
                    }}
                >
                    退出
                    <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export default UnifiedUserNavDropDown;
