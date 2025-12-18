import { auth } from '@/auth';

export const currentUser = async () => {
    const session = await auth();

    return session?.user;
};

export const currentRole = async () => {
    const session = await auth();

    return session?.user?.role;
};

export const currentPhoneVerified = async () => {
    const session = await auth();

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error: phoneVerified 可能不是 User 类型的属性
    return session?.user?.phoneVerified;
};
