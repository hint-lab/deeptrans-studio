import { uploadFileAction } from '@/actions/upload';
import { Button } from '@/components/ui/button';
import { createLogger } from '@/lib/logger';
import { isUploadErrorCode, type UploadErrorCode } from '@/lib/upload-errors';
import { MAX_UPLOAD_FILE_SIZE_BYTES } from '@/lib/upload-limits';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
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
    /** Clears this component when the owning page discards its file state. */
    resetKey?: string | number;
    /** Lets an owning page invalidate results before a replacement upload starts. */
    onUploadReset?: () => void;
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

export function FileUpload({
    onUploadComplete,
    projectName,
    projectId,
    elementName = 'FileUpload',
    acceptedFileTypes = PROJECT_DOCUMENT_ACCEPTED_FILE_TYPES,
    resetKey,
    onUploadReset,
}: FileUploadProps) {
    const t = useTranslations(elementName);
    const commonT = useTranslations('FileUpload');
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [uploadedFile, setUploadedFile] = useState<{
        fileName: string;
        originalName: string;
        fileUrl: string;
        contentType: string;
        size: number;
    } | null>(null);
    const uploadGenerationRef = useRef(0);
    const resetUpload = useCallback(() => {
        uploadGenerationRef.current += 1;
        setUploadedFile(null);
        setUploadError(null);
        onUploadReset?.();
    }, [onUploadReset]);

    useEffect(() => {
        // A parent may clear a completed file independently of this component.
        // Invalidate an in-flight upload too so an old response cannot reappear.
        uploadGenerationRef.current += 1;
        setUploadedFile(null);
        setUploadError(null);
        setIsUploading(false);
    }, [resetKey]);

    const messageForUploadError = useCallback(
        (value: unknown) => {
            const errorCode: UploadErrorCode | null = isUploadErrorCode(value) ? value : null;
            switch (errorCode) {
                case 'FILE_REQUIRED':
                    return commonT('noFileSelected');
                case 'FILE_TOO_LARGE':
                    return commonT('fileSizeExceeded');
                case 'FILE_TYPE_UNSUPPORTED':
                    return commonT('fileTypeNotSupported');
                case 'AUTH_REQUIRED':
                    return commonT('uploadAuthRequired');
                case 'ACCESS_DENIED':
                    return commonT('uploadPermissionDenied');
                default:
                    return commonT('uploadUnavailable');
            }
        },
        [commonT]
    );

    const showUploadError = useCallback((message: string) => {
        setUploadError(message);
        toast.error(message);
    }, []);

    const uploadFile = useCallback(
        async (file: File) => {
            if (!file) {
                logger.error(t('noFileSelected'));
                showUploadError(commonT('noFileSelected'));
                return;
            }

            logger.debug(t('uploadStarted'), {
                name: file.name,
                type: file.type,
                size: file.size,
                projectId,
            });

            // 检查文件大小
            if (file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
                showUploadError(commonT('fileSizeExceeded'));
                return;
            }

            if (projectName !== undefined && !projectName.trim()) {
                showUploadError(t('projectNameRequired'));
                return;
            }

            const uploadGeneration = ++uploadGenerationRef.current;
            setUploadError(null);
            setIsUploading(true);

            try {
                const form = new FormData();
                form.append('file', file);
                if (projectId) form.append('projectId', projectId);
                const uploadJson = await uploadFileAction(form);
                if (!uploadJson || !uploadJson.success || !uploadJson.data) {
                    if (uploadGeneration !== uploadGenerationRef.current) return;
                    showUploadError(messageForUploadError((uploadJson as any)?.errorCode));
                    return;
                }
                const uploadData = uploadJson.data as {
                    fileName: string;
                    originalName: string;
                    fileUrl: string;
                    contentType?: string;
                    size?: number;
                };
                const fileInfo = {
                    fileName: uploadData.fileName,
                    originalName: uploadData.originalName,
                    fileUrl: uploadData.fileUrl,
                    contentType: uploadData.contentType || file.type,
                    size: uploadData.size ?? file.size,
                };
                if (uploadGeneration !== uploadGenerationRef.current) return;
                onUploadComplete(fileInfo);
                setUploadedFile(fileInfo);
                setUploadError(null);

                toast.success(t('uploadSuccess'));
            } catch (error) {
                if (uploadGeneration !== uploadGenerationRef.current) return;
                // Server Action transport failures can contain framework or
                // infrastructure details. The action's coded failures are
                // handled above; every unexpected throw gets one safe retry
                // message instead of exposing its raw text.
                logger.error({
                    message: t('uploadFailed'),
                    errorName: error instanceof Error ? error.name : typeof error,
                });
                showUploadError(commonT('uploadUnavailable'));
            } finally {
                if (uploadGeneration === uploadGenerationRef.current) {
                    setIsUploading(false);
                }
            }
        },
        [
            commonT,
            messageForUploadError,
            onUploadComplete,
            projectId,
            projectName,
            showUploadError,
            t,
        ]
    );

    const onDrop = useCallback(
        (acceptedFiles: File[]) => {
            logger.debug(t('fileDrop'), acceptedFiles);
            if (acceptedFiles.length === 0) return;

            // A selected replacement makes the previous parent result stale even
            // before the new upload has finished.
            resetUpload();

            const file = acceptedFiles[0];
            if (file) {
                uploadFile(file);
            }
        },
        [resetUpload, uploadFile, t]
    );
    const onDropRejected = useCallback(
        (rejections: FileRejection[]) => {
            // Treat an attempted replacement as invalidating the previous
            // result too. Otherwise a failed replacement could leave the old
            // file looking like the current pending upload.
            resetUpload();
            const first = rejections[0];
            const errorCode = first?.errors[0]?.code;
            if (errorCode === 'file-too-large') {
                showUploadError(commonT('fileSizeExceeded'));
            } else {
                showUploadError(commonT('fileTypeNotSupported'));
            }
        },
        [commonT, resetUpload, showUploadError]
    );
    const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
        onDrop,
        onDropRejected,
        accept: acceptedFileTypes,
        maxFiles: 1,
        maxSize: MAX_UPLOAD_FILE_SIZE_BYTES,
        disabled: isUploading,
        // 允许点击选择文件
    });

    return (
        <div className="space-y-4">
            {/* Keep the dropzone input mounted even after a successful upload,
                so the visible re-upload button can reliably open a picker. */}
            <input {...getInputProps()} />
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
            {uploadError && (
                <p
                    role="alert"
                    aria-live="polite"
                    className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                >
                    {uploadError}
                </p>
            )}
        </div>
    );
}
