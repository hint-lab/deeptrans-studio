// 定义通用响应结构
export interface APIResponse<T> {
    error?: boolean;
    message?: string;
    data?: T;
  }
  
  export interface Message {
    message: string;
  }
  
  
  export interface Token {
    accessToken: string,
    refreshToken: string,
    tokenType: string
  }
  