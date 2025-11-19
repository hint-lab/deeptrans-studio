import { z } from "zod";

const registerSchema = z.object({
    name: z.string().min(6, "名字不能少于6个字符").default(""),
    phone: z.string().min(11, "手机号错误").default(""),
    otp: z.string().length(6, "必须6位数字").default("")
});



export { registerSchema, z };
