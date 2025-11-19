import { type Metadata } from "next";
import { LoginCard } from "./components/login-card";
import type { NextPage } from "next";
import Image from "next/image";
import LocaleSwitcher from "@/components/locale-switcher";

export const metadata: Metadata = {
  title: "Login",
  description: "Login to access our application",
};

const LoginPage: NextPage = () => {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[#0f1020] via-[#11122a] to-[#0b0c1a]">
      {/* 语言切换器 */}
      <div className="fixed right-4 top-4 z-50">
        <LocaleSwitcher variant="dark-bg" />
      </div>

      {/* 背景装饰 - 渐变光晕 */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-purple-600/40 via-purple-500/10 to-transparent blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-500/30 via-blue-400/10 to-transparent blur-3xl" />

      {/* 背景装饰 - 网格细线 */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:40px_40px] opacity-20" />

      <div className="flex flex-col z-10 w-full max-w-[480px] py-12 sm:px-8 justify-center">
        <div className="mb-8 mx-auto flex flex-col items-center justify-center w-full">
          <Image
            src="/logo_dark.svg"
            alt="DeepTrans Studio"
            width={320}
            height={56}
            className="opacity-95"
            priority
          />
        </div>
        <LoginCard />
      </div>
    </div>
  );
};
export default LoginPage;
