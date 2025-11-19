export interface Message {
    content: string;
    role: string;
    id?: string; // 可选的 ID 字段，用于更新消息
}

