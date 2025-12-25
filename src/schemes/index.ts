import { UserRole } from '@prisma/client';
import * as z from 'zod';

////////////////////////////////////////////

// Login form
export const LoginSchema = z.object({
    phone: z.string().min(11, '号码错误').default(''),
    code: z.string().length(6, '必须6位数字').default(''),
});

//////////////////////////////////////////////

// Register form
export const RegisterSchema = z
    .object({
        email: z.string().email({
            message: 'Email is required!',
        }),
        password: z.string().min(8, { message: 'Password must be at least 8 characters!' }),

        passwordConfirm: z.string().min(8, { message: 'Password must be at least 8 characters' }),

        name: z.string().min(1, {
            message: 'Name is required!',
        }),
    })
    .refine(data => data.password === data.passwordConfirm, {
        message: "Password don't match!",
        path: ['passwordConfirm'],
    });

///////////////////////////////////////////////

export const ResetSchema = z.object({
    email: z.string().email({
        message: 'Email is required!',
    }),
});

/////////////////////////////////////////////

export const NewPasswordSchema = z
    .object({
        password: z.string().min(8, { message: 'Password must be at least 8 characters' }),

        passwordConfirm: z
            .string()
            .min(8, { message: 'PasswordConfirm must be at least 8 characters' }),
    })
    .refine(data => data.password === data.passwordConfirm, {
        message: "Password don't match!",
        path: ['passwordConfirm'],
    });

//////////////////////////////////////////////

export const SettingSchema = z
    .object({
        name: z.optional(z.string()),
        isTwoFactorEnabled: z.optional(z.boolean()),
        role: z.optional(z.enum([UserRole.ADMIN, UserRole.USER])),
        email: z.optional(z.string().email()),
        password: z.optional(z.string().min(6)),
        newPassword: z.optional(z.string().min(6)),
    })
    .refine(
        data => {
            if (data.password && !data.newPassword) {
                return false;
            }

            if (data.newPassword && !data.password) {
                return false;
            }

            return true;
        },
        {
            message: 'New password is required!',
            path: ['newPassword'],
        }
    );
