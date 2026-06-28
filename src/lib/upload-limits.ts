export const MAX_UPLOAD_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_FILE_SIZE_LABEL = '10MB';

export function assertUploadFileSize(size: number) {
    if (size > MAX_UPLOAD_FILE_SIZE_BYTES) {
        throw new Error(`文件大小不能超过 ${MAX_UPLOAD_FILE_SIZE_LABEL}`);
    }
}
