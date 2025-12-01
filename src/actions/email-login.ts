"use server";
import { signIn } from "@/auth";
import { DEFAULT_LOGIN_REDIRECT } from "@/routes";
import { findUserByEmailDB, createUserDB, updateUserByIdDB } from "@/db/user";
import { getVerificationCodeByEmail } from "@/db/verificationCode";

export const emailLoginAction = async (
  values: { email: string; code: string },
  callbackUrl?: string | null
) => {
  const email = values?.email?.trim();
  const code = values?.code?.trim();
  if (!email || !code) return { error: "邮箱或验证码缺失" };

  let existingUser = await findUserByEmailDB(email);
  if (!existingUser) {
    const newUser = await createUserDB({ email });
    if (!newUser) return { error: "自动创建用户失败，请稍后重试" };
    existingUser = newUser;
  }
  if (process.env.IS_DEMO === 'yes'){
    if (code === '123456' && email === 'test@example.com') {
      await updateUserByIdDB(existingUser.id, { emailVerified: new Date() });
    } else{
      return { error: "演示环境仅允许使用固定验证码123456和固定邮箱test@example.com" };
    }
  }else{
    const record = await getVerificationCodeByEmail(email);
    if (!record || record.code !== code) return { error: "邮箱或验证码错误"};
    await updateUserByIdDB(existingUser.id, { emailVerified: new Date() });
  }

  try {
    await signIn("credentials", {
      email,
      code,
      redirectTo: callbackUrl || DEFAULT_LOGIN_REDIRECT,
    });
  } catch (error: any) {
    if (error?.message === "NEXT_REDIRECT" || error?.digest?.includes?.("NEXT_REDIRECT")) {
      throw error;
    }
    return { error: "登录失败，请重试"+error };
  }

  return { success: "登录成功" };
}


