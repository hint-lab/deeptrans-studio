import { getUploadUrlAction, uploadFileAction } from '@/actions/upload';
import { Button } from '@/components/ui/button';
import { createLogger } from '@/lib/logger';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { type Accept, FileRejection, useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
const logger = createLogger({
    type: 'components:file-upload',
}, {
    json: false,// 开启json格式输出
    pretty: false, // 关闭开发环境美化输出
    colors: true, // 仅当json：false时启用颜色输出可用
    includeCaller: false, // 日志不包含调用者
});
interface FileUploadProps {
    onUploadComplete: (fileInfo: {
        fileName: string;
        originalName: string;
        fileUrl: string;
        contentType: string;
        size: number;
    }) => void;
    projectName?: string;
    projectId?: string;
    elementName: string;
    acceptedFileTypes?: Accept;
}

export const PROJECT_DOCUMENT_ACCEPTED_FILE_TYPES: Accept = {
    'application/pdf': ['.pdf'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'text/plain': ['.txt'],
    'text/markdown': ['.md', '.markdown'],
    'application/octet-stream': ['.md', '.markdown'],
};

export const DOCX_ACCEPTED_FILE_TYPES: Accept = {
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
};

export const IMAGE_ACCEPTED_FILE_TYPES: Accept = {
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/webp': ['.webp'],
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function FileUpload({
    onUploadComplete,
    projectName,
    projectId,
    elementName = 'FileUpload',
    acceptedFileTypes = PROJECT_DOCUMENT_ACCEPTED_FILE_TYPES,
}: FileUploadProps) {
    const t = useTranslations(elementName);
    const [isUploading, setIsUploading] = useState(false);
    const resetUpload = useCallback(() => {
        setUploadedFile(null);
    }, []);
    const [uploadedFile, setUploadedFile] = useState<{
        fileName: string;
        originalName: string;
        fileUrl: string;
        contentType: string;
        size: number;
    } | null>(null);

    const uploadFile = useCallback(
        async (file: File) => {
            if (!file) {
                logger.error(t('noFileSelected'));
                return;
            }

            logger.debug(t('uploadStarted'), {
                name: file.name,
                type: file.type,
                size: file.size,
                projectId,
            });

            // 检查文件大小
            if (file.size > MAX_FILE_SIZE) {
                toast.error(t('fileSizeExceeded'));
                return;
            }

            if (projectName !== undefined && !projectName.trim()) {
                toast.error(t('projectNameRequired'));
                return;
            }

            setIsUploading(true);

            try {
                // 1. 获取预签名上传 URL
                const result = await getUploadUrlAction(file.name, file.type, { projectId });

                if (!result.success || !result.data) {
                    throw new Error(result.error || t('getUrlFailed'));
                }

                const { data } = result;

                // 2. 先尝试直接上传（浏览器直传）
                let directOk = false;
                try {
                    const uploadResponse = await fetch(data.uploadUrl, {
                        method: 'PUT',
                        body: file,
                        headers: {
                            'Content-Type': file.type,
                        },
                        // mode/cors 由浏览器默认处理；若 CORS 拦截会抛出 TypeError
                    });
                    directOk = uploadResponse.ok;
                    if (!uploadResponse.ok) {
                        logger.warn(
                            t('directUploadWarning'),
                            uploadResponse.status,
                            uploadResponse.statusText
                        );
                    }
                } catch (err) {
                    logger.warn(t('directUploadFailed'), err);
                }

                // 3. 回退：Server Action 直传（优先于 /api 代理）
                if (!directOk) {
                    const form = new FormData();
                    form.append('file', file);
                    if (projectId) form.append('projectId', projectId);
                    const proxyJson = await uploadFileAction(form);
                    if (!proxyJson || !proxyJson.success || !proxyJson.data) {
                        throw new Error((proxyJson as any)?.error || t('serverUploadFailed'));
                    }
                    const proxyData = proxyJson.data as {
                        fileName: string;
                        originalName: string;
                        fileUrl: string;
                        contentType?: string;
                        size?: number;
                    };
                    const fileInfo = {
                        fileName: proxyData.fileName,
                        originalName: proxyData.originalName,
                        fileUrl: proxyData.fileUrl,
                        contentType: proxyData.contentType || file.type,
                        size: proxyData.size || file.size,
                    };
                    onUploadComplete(fileInfo);
                    setUploadedFile(fileInfo);
                    toast.success(t('uploadSuccess'));
                    return;
                }

                logger.debug(t('uploadSuccess'));
                const fileInfo = {
                    fileName: data.fileName,
                    originalName: data.originalName,
                    fileUrl: data.fileUrl,
                    contentType: file.type,
                    size: file.size,
                };
                onUploadComplete(fileInfo);
                setUploadedFile(fileInfo);

                toast.success(t('uploadSuccess'));
            } catch (error) {
                logger.error(t('uploadFailed'), error);
                toast.error(error instanceof Error ? error.message : t('uploadFailed'));
            } finally {
                setIsUploading(false);
            }
        },
        [onUploadComplete, projectId, projectName, t]
    );

    const onDrop = useCallback(
        (acceptedFiles: File[]) => {
            logger.debug(t('fileDrop'), acceptedFiles);
            if (acceptedFiles.length === 0) return;

            // 重置上传状态
            setUploadedFile(null);

            const file = acceptedFiles[0];
            if (file) {
                uploadFile(file);
            }
        },
        [uploadFile, t]
    );
    const onDropRejected = useCallback(
        (rejections: FileRejection[]) => {
            const first = rejections[0];
            const errorCode = first?.errors[0]?.code;
            if (errorCode === 'file-too-large') {
                toast.error(t('fileSizeExceeded'));
            } else {
                toast.error(t('fileTypeNotSupported'));
            }
        },
        [t]
    );
    const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
        onDrop,
        onDropRejected,
        accept: acceptedFileTypes,
        maxFiles: 1,
        maxSize: MAX_FILE_SIZE,
        disabled: isUploading,
        // 允许点击选择文件
    });

    return (
        <div className="space-y-4">
            {uploadedFile ? (
                <>
                    <div className="mt-4 rounded-md border p-4 text-left">
                        <div className="mb-1 font-medium">{t('uploadedFile')}</div>
                        <div className="text-sm text-gray-700">
                            {t('originalName')}：{uploadedFile.originalName}
                        </div>
                        {/* <div className="text-sm text-gray-700 break-all">存储名称：{uploadedFile.fileName}</div> */}
                        <div className="text-sm text-gray-700">
                            {t('fileType')}：{uploadedFile.contentType}，
                            {(uploadedFile.size / 1024).toFixed(1)} KB
                        </div>
                        <div className="mt-2 text-sm">
                            <a
                                href={uploadedFile.fileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary hover:underline"
                            >
                                {t('openFile')}
                            </a>
                        </div>
                    </div>
                    <Button
                        className="w-full bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
                        disabled={isUploading}
                        onClick={() => {
                            resetUpload();  // 先重置状态
                            open();         // 再打开文件选择器
                        }}
                    >
                        {isUploading ? t('uploading') : t('reupload')}
                    </Button>
                </>
            ) : (
                <>
                    <div
                        {...getRootProps()}
                        className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${isDragActive ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-primary'} ${isUploading ? 'cursor-not-allowed opacity-50' : ''}`}
                    >
                        <input {...getInputProps()} />
                        <div className="space-y-2">
                            <div className="text-lg font-medium">
                                {isDragActive ? t('dragActiveText') : t('dragInactiveText')}
                            </div>
                            <div className="text-sm text-gray-500">{t('supportedFormats')}</div>
                            {isUploading && (
                                <div className="text-sm text-primary">{t('uploadingText')}</div>
                            )}
                        </div>
                    </div>

                    <Button
                        className="w-full bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
                        disabled={isUploading}
                        onClick={open}
                    >
                        {isUploading ? t('uploading') : t('selectFile')}
                    </Button>
                </>
            )}
        </div>
    );
}
