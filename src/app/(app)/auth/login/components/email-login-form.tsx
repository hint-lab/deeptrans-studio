"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { emailLoginAction } from "@/actions/email-login";
import { useTranslations } from "next-intl";

export function EmailLoginForm({ buttonText }: { buttonText?: string }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [isPending, startTransition] = useTransition();
  const t = useTranslations("Auth");

  const sendCode = async () => {
    if (!email) {
      toast.error(t("pleaseEnterEmail"));
      return;
    }
    try {
      const form = new FormData();
      form.set('mode', 'email');
      form.set('email', email);
      const res = await fetch("/api/auth/send-email", { method: "POST", body: form });
      if (res.ok) {
        toast.info(process.env.NODE_ENV === "development" ? t("codeSentDev") : t("codeSent"));
        setCooldown(60);
        const timer = setInterval(() => {
          setCooldown((s) => {
            if (s <= 1) { clearInterval(timer); return 0; }
            return s - 1;
          });
        }, 1000);
      } else {
        toast.error(t("sendFailed"));
      }
    } catch (e: any) {
      toast.error(`${t("sendFailed")}：${e.message}`);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await emailLoginAction({ email, code }, null);
      if (result?.error) toast.error(t("loginFailed", { error: result.error }));
      if (result?.success) toast.success(t("loginSuccess"));
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="flex flex-col justify-center gap-2  space-y-4">
        {/* 邮箱 */}
        <div>
          <div className="mb-1 text-sm">{t("email")}</div>
          <div className="flex items-center justify-start rounded-full border border-muted hover:border hover:border-primary p-1">
            <input
              id="email"
              placeholder={t("enterEmail")}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mx-6 w-full p-1 bg-transparent outline-none border-none focus-visible:border-none focus-visible:ring-0 hover:border-none hover:ring-0"
            />
          </div>
        </div>

        {/* 验证码 */}
        <div>
          <div className="mb-1 text-sm">{t("verificationCode")}</div>
          <div className="flex items-center justify-center space-x-4 rounded-full border border-muted hover:border hover:border-primary p-1">
            <input
              id="otp"
              placeholder={t("enterCode")}
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mx-6 w-full p-1 bg-transparent outline-none border-none shadow-none focus-visible:border-none focus-visible:ring-0 hover:border-none hover:ring-0"
            />
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={sendCode}
              disabled={cooldown > 0}
              className="mr-2 text-primary"
            >
              {cooldown > 0 ? t("retryAfter", { seconds: cooldown }) : t("getCode")}
            </Button>
          </div>
        </div>

        {/* 条款提示已移除 */}

        {/* 提交按钮 */}
        <div className="space-y-4 pb-2">
          <Button type="submit" variant="default" className="w-full transition delay-150 duration-300" disabled={isPending}>
            {buttonText || t("login")}
          </Button>
        </div>
      </div>
    </form>
  );
}


