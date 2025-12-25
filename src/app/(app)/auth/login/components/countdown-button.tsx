'use client';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { login } from '@/actions/login';

interface CountdownButtonProps {
    phoneNumber: string;
}

const CountdownButton = ({ phoneNumber }: CountdownButtonProps) => {
    const [countdown, setCountdown] = useState(0);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (countdown > 0) {
            const timer = setTimeout(() => {
                setCountdown(countdown - 1);
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [countdown]);

    const handleSendSMS = async () => {
        if (!phoneNumber) {
            toast.error('请输入手机号码');
            return;
        }

        setIsLoading(true);
        try {
            // 调用服务器端操作发送短信
            if (process.env.NODE_ENV === 'development') {
                toast.info('开发环境，默认验证码123456');
                const result = {
                    success: '开发环境，默认验证码123456',
                    code: '123456',
                };
                // 可以将验证码存储到 localStorage 或 Context 中用于测试
                window.localStorage.setItem('verificationCode', result.success || '');
                setCountdown(60); // 开始倒计时
            } else {
                const result = await login({ phone: phoneNumber, code: '123456' });
                if (result.success) {
                    toast.info(result.success);
                    // 可以将验证码存储到 localStorage 或 Context 中用于测试
                    window.localStorage.setItem('verificationCode', result.success || '');
                    setCountdown(60); // 开始倒计时
                } else {
                    toast.error(result.error);
                }
            }
        } catch (error) {
            toast.error('发送验证码失败，请稍后重试');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Button
            type="button"
            variant="link"
            size="sm"
            onClick={handleSendSMS}
            disabled={countdown > 0 || isLoading}
            className="mr-2 text-primary"
        >
            {isLoading ? '发送中...' : countdown > 0 ? `${countdown}秒后重试` : '获取验证码'}
        </Button>
    );
};

export default CountdownButton;
