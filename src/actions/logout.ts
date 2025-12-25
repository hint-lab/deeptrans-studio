'use server';

import { signOut } from '@/auth';

export const logout = async () => {
    // Some server stuff to implement
    await signOut({ redirectTo: '/' });
};
