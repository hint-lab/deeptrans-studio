import StoreProvider from '../StoreProvider';
export default function APPLayout({ children }: { children: React.ReactNode }) {
    return <StoreProvider>{children}</StoreProvider>;
}
