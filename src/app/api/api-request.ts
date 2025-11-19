import { getCookie } from 'cookies-next';
import { APIResponse } from './api';
import { keysToSnake, keysToCamel, convertDatesToISOStrings } from '@/utils/func';
// import { HeadersInit, RequestInit } from 'node-fetch';
// 定义通用的请求函数

export async function APIRequestWithCredentials<T, B = unknown>(
  endpoint: string,
  method: string = 'GET',
  credentials: boolean = false,
  body?: B
): Promise<APIResponse<T>> {
  try {
    // 判断数据是否存在
    const isDataProvided = body !== undefined && body !== null;

    // 判断数据类型是否为 FormData
    const isMultipart = isDataProvided && body instanceof FormData;

    const headers: HeadersInit = {
      Accept: 'application/json',
      ...(isMultipart ? {} : { 'Content-Type': 'application/json' }),
      // 根据 credentials 的值决定是否添加 Authorization 头
      ...(credentials
        ? { Authorization: 'Bearer ' + getCookie('accessToken') }
        : {}),
    };
    // 配置 fetch 选项
    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    // 如果是 POST、PUT、PATCH 等方法并且有数据，则处理 body
    if (
      isDataProvided &&
      (method === 'POST' || method === 'PUT' || method === 'PATCH')
    ) {
      const processedBody = isMultipart ? body : convertDatesToISOStrings(body);
      fetchOptions.body = isMultipart ? processedBody : JSON.stringify(keysToSnake(processedBody));
      //如果是 multipart/form-data，则直接使用 body，否则将 body 转换为 JSON 字符串
      // fetchOptions.body = isMultipart
      //   ? body
      //   : JSON.stringify(keysToSnake(body));
    }

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/${endpoint}`,
      fetchOptions
    );

    if (!response.ok) {

      // 处理非 2xx 响应
      const errorData = await response.json();
      const result = errorData.detail.replace(/^\d+: /, ''); // 去掉开头的状态码
      console.error('错误信息:', result); // 这里可以访问 detail
      throw new Error(`${result}`);
    }

    const data: unknown = await response.json(); // 获取 JSON 格式的响应
    const camelCaseData = keysToCamel(data) as T; // 将下划线命名转换为驼峰命名
    return { data: camelCaseData }; // 返回转换后的数据
  } catch (error) {
    console.error('API request error:', error);
    // 类型保护
    if (error instanceof Error) {
      return { error: true, message: error.message };
    } else {
      return { error: true, message: '未知错误' };
    }
  }
}
