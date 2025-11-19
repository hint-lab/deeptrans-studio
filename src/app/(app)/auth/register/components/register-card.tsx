"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { EmailLoginForm } from "../../login/components/email-login-form";
import { useTranslations } from "next-intl";

export const RegisterCard = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [isPending, startTransition] = useTransition();
  const t = useTranslations("Auth");

  const sendCode = async () => {
    try {
      const form = new FormData();
      form.set('mode', 'email');
      form.set('email', email.trim());
      const r = await fetch('/api/auth/send-code', { method: 'POST', body: form });
      if (!r.ok) throw new Error(t("sendFailed"));
      toast.info(process.env.NODE_ENV === 'development' ? t("codeSentDev") : t("codeSent"));
      setCooldown(60);
      const timer = setInterval(() => setCooldown(s => { if (s <= 1) { clearInterval(timer); return 0; } return s - 1; }), 1000);
    } catch (e: any) {
      toast.error((e as Error)?.message || t("sendFailed"));
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        const form = new FormData();
        form.set('mode', 'email');
        form.set('name', name.trim());
        form.set('email', email.trim());
        form.set('code', code.trim());
        const r = await fetch('/api/auth/register', { method: 'POST', body: form });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j?.error) throw new Error((j as any)?.error || t("registerFailed"));
        toast.success(t("registerSuccess"));
        window.location.href = '/dashboard';
      } catch (e: any) {
        toast.error((e as Error)?.message || t("registerFailed"));
      }
    });
  };

  return (
    <Card className="w-full border-none">
      <CardHeader>
        <CardTitle className="text-center text-2xl">{t("register")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <div className="mb-1 text-sm">{t("nickname")}</div>
            <input className="w-full rounded-full border px-4 py-2 bg-transparent" placeholder={t("enterNickname")} value={name} onChange={e => setName(e.target.value)} />
          </div>
          {/* 复用 EmailLoginForm 的界面与交互，但按钮文案改为 注册并登录 */}
          <EmailLoginForm buttonText={t("registerAndLogin")} />
        </div>
      </CardContent>
    </Card>
  );
}


