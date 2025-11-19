"use client";
import { Button } from "@/components/ui/button"
import Image from "next/image"
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "src/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmailLoginForm } from "./email-login-form"
import { useTranslations } from "next-intl"

export const LoginCard = () => {
    const t = useTranslations("Auth");

    return (
        <Card className="w-full border-none">
            <CardHeader>
                <CardTitle className="text-center text-2xl">{t("login")}</CardTitle>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue="email" className="w-full">
                    <div className="flex w-full justify-center">
                        <TabsList>
                            <TabsTrigger value="email">{t("emailLogin")}</TabsTrigger>
                            <TabsTrigger value="oauth">{t("oauthLogin")}</TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="email" className="mt-6">
                        <EmailLoginForm />
                    </TabsContent>

                    <TabsContent value="oauth" className="mt-6">
                        <div className="flex flex-col gap-3 space-y-4">
                            <a href="/api/auth/oauth/github" className="w-full">
                                <Button variant="secondary" type="button" className="w-full">
                                    <Image src="/github.svg" alt="GitHub" width="32" height="32" className="mr-2 h-4 w-4" />
                                    {t("githubLogin")}
                                </Button>
                            </a>
                            <a href="/api/auth/oauth/google" className="w-full">
                                <Button variant="secondary" type="button" className="w-full">
                                    <Image src="/google.svg" alt="Google" width="32" height="32" className="mr-2 h-4 w-4" />
                                    {t("googleLogin")}
                                </Button>
                            </a>
                        </div>
                    </TabsContent>
                </Tabs>
                <div className="text-center text-sm mt-4">
                    {t("noAccount")} <a className="underline" href="/auth/register">{t("goRegister")}</a>
                </div>
            </CardContent>
        </Card>
    )
}