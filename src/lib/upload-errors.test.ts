import assert from 'node:assert/strict';
import test from 'node:test';
import {
    isUploadErrorCode,
    UPLOAD_ERROR_CODES,
    UPLOAD_PUBLIC_MESSAGES,
    uploadFailure,
    uploadFailureFromError,
} from './upload-errors';

test('upload failures expose only the stable public vocabulary', () => {
    const storageError = new Error('S3 SecretKey=abc connection refused at 10.0.0.8/private-bucket');
    const failure = uploadFailureFromError(storageError);

    assert.deepEqual(failure, uploadFailure(UPLOAD_ERROR_CODES.UPLOAD_UNAVAILABLE));
    assert.equal(failure.error.includes('SecretKey'), false);
    assert.equal(failure.error.includes('10.0.0.8'), false);
});

test('upload failures preserve login and project-write guidance without guard details', () => {
    const unauthenticated = Object.assign(new Error('未授权'), {
        name: 'GuardError',
        status: 401,
    });
    const denied = Object.assign(new Error('项目 project-other 不存在或无权写入'), {
        name: 'GuardError',
        status: 404,
    });

    assert.deepEqual(
        uploadFailureFromError(unauthenticated),
        uploadFailure(UPLOAD_ERROR_CODES.AUTH_REQUIRED)
    );
    assert.deepEqual(
        uploadFailureFromError(denied),
        uploadFailure(UPLOAD_ERROR_CODES.ACCESS_DENIED)
    );
});

test('upload failure codes remain machine-readable for localized client feedback', () => {
    assert.equal(isUploadErrorCode(UPLOAD_ERROR_CODES.FILE_TOO_LARGE), true);
    assert.equal(isUploadErrorCode('S3_TIMEOUT'), false);
    assert.equal(
        uploadFailure(UPLOAD_ERROR_CODES.FILE_TOO_LARGE).error,
        UPLOAD_PUBLIC_MESSAGES.FILE_TOO_LARGE
    );
});
