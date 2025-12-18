import React, { ComponentType } from 'react';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import Loading from './loading';

function LoadingMessage() {
    return (
        <>
            <div className="fixed left-0 top-0 z-50 flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-orange-400">
                <Image
                    src="/wechat.svg"
                    style={{ display: 'flex', width: '20vw', height: '20vw' }}
                    alt="logo"
                    width="32"
                    height="32"
                    priority
                />
                <br />
            </div>
        </>
    );
}
function withSplashScreen(WrappedComponent: ComponentType<any>) {
    return function (props: any) {
        const [loading, setLoading] = useState(true);

        useEffect(() => {
            const timer = setTimeout(() => {
                setLoading(false);
            }, 2000);

            return () => clearTimeout(timer);
        }, []);

        if (loading) {
            return <Loading />; // 你可以将这行替换为你自己的Loading组件
        }

        return <WrappedComponent {...props} />;
    };
}

export default withSplashScreen;
