// 将字符串转换为驼峰命名
export function toCamelCase(str: string) {
  return str.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
}

// 将对象中的键转换为驼峰命名
export function keysToCamel(obj: any): any[] | Record<string, any> | unknown {
  if (Array.isArray(obj)) {
    return obj.map((v) => keysToCamel(v)); // 处理数组中的每个元素
  } else if (obj !== null && obj.constructor === Object) {
    return Object.keys(obj).reduce(
      (result: Record<string, any>, key: string) => {
        const camelKey = toCamelCase(key); // 转换为驼峰命名
        result[camelKey] = keysToCamel(obj[key]); // 递归处理
        return result;
      },
      {}
    );
  }
  return obj;
}

// 将字符串转换为下划线命名
export function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

// 将对象中的键转换为下划线命名
export function keysToSnake(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map((v) => keysToSnake(v)); // 递归处理数组
  } else if (obj !== null && obj.constructor === Object) {
    return Object.keys(obj).reduce(
      (result: Record<string, any>, key: string) => {
        const snakeKey = toSnakeCase(key); // 转换为下划线命名
        // result[snakeKey] = keysToSnake(obj[key]); // 递归处理
        result[snakeKey] = obj[key]; // 递归处理
        return result;
      },
      {}
    );
  }
  return obj; // 返回非对象或数组的值
}


export function convertDatesToISOStrings(obj: any): any {
  if (obj instanceof Date) {
    return obj.toISOString();
  } else if (Array.isArray(obj)) {
    return obj.map(convertDatesToISOStrings);
  } else if (typeof obj === 'object' && obj !== null) {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [key, convertDatesToISOStrings(value)])
    );
  }
  return obj;
}