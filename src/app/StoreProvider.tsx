'use client';
import { useRef } from 'react';
import { Provider } from 'react-redux';
import { store, type AppStore } from '@/store/index';

export default function StoreProvider({ children }: { children: React.ReactNode }) {
    const storeRef = useRef<AppStore>();
    if (!storeRef.current) {
        // Create the store instance the first time this renders
        storeRef.current = store;
    }

    return <Provider store={storeRef.current}>{children}</Provider>;
}
