import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { getUploadUrlAction, uploadFileAction } from '@/actions/upload';
import { useTranslations } from 'next-intl';

interface FileUploadProps {
    onUploadComplete: (fileInfo: {
        fileName: string;
        originalName: string;
        fileUrl: string;
        contentType: string;
        size: number;
    }) => void;
    projectName: string;
    elementName: string;
}

const ACCEPTED_FILE_TYPES = {
    /* 图片 */
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/webp': ['.webp'],

    /* 文档 */
    'application/pdf': ['.pdf'],
    'application/msword': ['.doc'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    'application/vnd.ms-powerpoint': ['.ppt'],
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],

    /* 文本 */
    'text/plain': ['.txt'],
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function FileUpload({ onUploadComplete, projectName, elementName='FileUpload' }: FileUploadProps) {
    const t = useTranslations(elementName);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadedFile, setUploadedFile] = useState<{
        fileName: string;
        originalName: string;
        fileUrl: string;
        contentType: string;
        size: number;
    } | null>(null);

    const uploadFile = useCallback(async (file: File) => {
        if (!file) {
            console.error(t('noFileSelected'));
            return;
        }

        console.log(t('uploadStarted'), {
            name: file.name,
            type: file.type,
            size: file.size,
            projectName
        });

        // 检查文件大小
        if (file.size > MAX_FILE_SIZE) {
            toast.error(t('fileSizeExceeded'));
            return;
        }

        if (!projectName.trim()) {
            toast.error(t('projectNameRequired'));
            return;
        }

        setIsUploading(true);

        try {
            // 1. 获取预签名上传 URL
            const result = await getUploadUrlAction(file.name, file.type, projectName.trim());
            console.log(t('getUrlResult'), result);

            if (!result.success || !result.data) {
                throw new Error(result.error || t('getUrlFailed'));
            }

            const { data } = result;

            // 2. 先尝试直接上传（浏览器直传）
            console.log(t('uploadingToStorage'), data.uploadUrl);
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
                    console.warn(t('directUploadWarning'), uploadResponse.status, uploadResponse.statusText);
                }
            } catch (err) {
                console.warn(t('directUploadFailed'), err);
            }

            // 3. 回退：Server Action 直传（优先于 /api 代理）
            if (!directOk) {
                const form = new FormData();
                form.append('file', file);
                form.append('projectName', projectName.trim());
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

            console.log(t('uploadSuccess'));
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
            console.error(t('uploadFailed'), error);
            toast.error(error instanceof Error ? error.message : t('uploadFailed'));
        } finally {
            setIsUploading(false);
        }
    }, [onUploadComplete, projectName]);

    const onDrop = useCallback((acceptedFiles: File[]) => {
        console.log(t('fileDrop'), acceptedFiles);
        if (acceptedFiles.length === 0) return;
        const file = acceptedFiles[0];
        if (file) {
            uploadFile(file);
        }
    }, [uploadFile]);
    const onDropRejected = useCallback((rejections: FileRejection[]) => {
      const first = rejections[0];
      if (first.errors[0]?.code === 'file-too-large') {
        toast.error(t('fileSizeExceeded')); 
      } else {
        toast.error(t('fileTypeNotSupported'));
      }
    }, [t]);
    const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
        onDrop,
        onDropRejected,
        accept: ACCEPTED_FILE_TYPES,
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
                        <div className="font-medium mb-1">{t('uploadedFile')}</div>
                        <div className="text-sm text-gray-700">{t('originalName')}：{uploadedFile.originalName}</div>
                        {/* <div className="text-sm text-gray-700 break-all">存储名称：{uploadedFile.fileName}</div> */}
                        <div className="text-sm text-gray-700">{t('fileType')}：{uploadedFile.contentType}，{(uploadedFile.size / 1024).toFixed(1)} KB</div>
                        <div className="text-sm mt-2">
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
                        onClick={open}
                    >
                        {isUploading ? t('uploading') : t('reupload')}
                    </Button></>
            )
                : (<>
                    <div
                        {...getRootProps()}
                        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                    ${isDragActive ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-primary'}
                    ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        <input {...getInputProps()} />
                        <div className="space-y-2">
                            <div className="text-lg font-medium">
                                {isDragActive ? t('dragActiveText') : t('dragInactiveText')}
                            </div>
                            <div className="text-sm text-gray-500">
                                {t('supportedFormats')}
                            </div>
                            {isUploading && (
                                <div className="text-sm text-primary">
                                    {t('uploadingText')}
                                </div>
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