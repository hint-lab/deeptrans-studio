// 导入zodResolver函数，用于将zod验证器与react-hook-form结合使用
import { zodResolver } from '@hookform/resolvers/zod';
// 导入useForm函数，用于创建表单
import { useForm, type FieldValues, type UseFormProps } from 'react-hook-form';
// 导入zod库，用于定义验证规则
import { type z } from 'zod';

// 定义useZodForm函数，用于创建zod验证的表单
export default function useZodForm<TValues extends FieldValues>(
    schema: z.ZodType<TValues>,
    props?: Omit<UseFormProps<TValues>, 'resolver'>
) {
    // 返回一个表单实例，使用zodResolver作为验证器
    return useForm<TValues>({
        resolver: zodResolver(schema),
        ...(props || {}),
    });
}
