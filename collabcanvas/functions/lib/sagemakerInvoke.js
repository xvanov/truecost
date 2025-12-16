"use strict";
/**
 * SageMaker Endpoint Invocation Cloud Function
 * Handles server-side SageMaker endpoint invocation with AWS credentials
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sagemakerInvoke = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const admin = require("firebase-admin");
// Define secrets for Firebase Functions v2
const awsAccessKeyIdSecret = (0, params_1.defineSecret)('AWS_ACCESS_KEY_ID');
const awsSecretAccessKeySecret = (0, params_1.defineSecret)('AWS_SECRET_ACCESS_KEY');
const sagemakerEndpointNameSecret = (0, params_1.defineSecret)('SAGEMAKER_ENDPOINT_NAME');
const awsRegionSecret = (0, params_1.defineSecret)('AWS_REGION');
// Lazy initialization for admin
let _adminInitialized = false;
function initializeAdmin() {
    if (_adminInitialized)
        return;
    _adminInitialized = true;
    try {
        admin.app();
    }
    catch (_a) {
        admin.initializeApp();
    }
}
// Configuration
const TIMEOUT_SECONDS = 60;
const DEFAULT_ENDPOINT_NAME = 'locatrix-blueprint-endpoint-dev';
const DEFAULT_AWS_REGION = 'us-east-2';
/**
 * Sleep utility for retry delays
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * Invoke SageMaker endpoint with retry logic and exponential backoff
 */
async function invokeSageMakerEndpoint(imageData, credentials, attempt = 1, maxAttempts = 3) {
    initializeAdmin();
    const { accessKeyId, secretAccessKey, endpointName, region } = credentials;
    if (!accessKeyId || !secretAccessKey) {
        throw new Error('AWS credentials are not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY secrets.');
    }
    // Use AWS SDK for JavaScript (Node.js)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AWS = require('aws-sdk');
    const awsRegion = region || DEFAULT_AWS_REGION;
    const sagemakerRuntime = new AWS.SageMakerRuntime({
        region: awsRegion,
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
        httpOptions: {
            timeout: TIMEOUT_SECONDS * 1000,
        },
    });
    const inputData = {
        image_data: imageData,
    };
    try {
        console.log(`[SAGEMAKER] Invoking endpoint: ${endpointName} (attempt ${attempt}/${maxAttempts})`);
        console.log(`[SAGEMAKER] Region: ${awsRegion}, Image data length: ${imageData.length} chars`);
        const response = await sagemakerRuntime.invokeEndpoint({
            EndpointName: endpointName,
            ContentType: 'application/json',
            Body: JSON.stringify(inputData),
        }).promise();
        const responseBody = response.Body.toString('utf-8');
        let result;
        // Handle TorchServe response format (list of JSON strings)
        try {
            result = JSON.parse(responseBody);
            // If it's a list (TorchServe format), take the first element
            if (Array.isArray(result) && result.length > 0) {
                result = JSON.parse(result[0]);
            }
        }
        catch (_a) {
            // If parsing fails, try treating as direct JSON
            result = JSON.parse(responseBody);
        }
        if (!result.detections) {
            console.warn('[SAGEMAKER] Response missing detections key');
            return [];
        }
        console.log(`[SAGEMAKER] Successfully received ${result.detections.length} detections`);
        return result.detections;
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStr = errorMessage.toLowerCase();
        // Check for specific error types
        if (errorStr.includes('not found') || errorStr.includes('endpoint') && errorStr.includes('not found')) {
            throw new Error(`SageMaker endpoint '${endpointName}' not found. Please verify the endpoint name and region.`);
        }
        if (errorStr.includes('timeout') || errorStr.includes('timed out')) {
            if (attempt < maxAttempts) {
                const delay = Math.pow(2, attempt - 1) * 1000; // Exponential backoff: 1s, 2s, 4s
                console.log(`[SAGEMAKER] Timeout error, retrying after ${delay}ms...`);
                await sleep(delay);
                return invokeSageMakerEndpoint(imageData, credentials, attempt + 1, maxAttempts);
            }
            throw new Error(`Request timed out after ${TIMEOUT_SECONDS} seconds. The endpoint may be taking longer than expected.`);
        }
        if (errorStr.includes('modelerror') || errorStr.includes('validationerror')) {
            throw new Error('Model validation error. Please check the input image format.');
        }
        // Retry on transient errors
        if ((errorStr.includes('throttling') || errorStr.includes('service unavailable')) && attempt < maxAttempts) {
            const delay = Math.pow(2, attempt - 1) * 1000;
            console.log(`[SAGEMAKER] Transient error, retrying after ${delay}ms...`);
            await sleep(delay);
            return invokeSageMakerEndpoint(imageData, credentials, attempt + 1, maxAttempts);
        }
        throw error;
    }
}
/**
 * Cloud Function to invoke SageMaker annotation endpoint
 */
exports.sagemakerInvoke = (0, https_1.onCall)({
    cors: true,
    timeoutSeconds: 90,
    memory: '512MiB',
    maxInstances: 10,
    secrets: [awsAccessKeyIdSecret, awsSecretAccessKeySecret, sagemakerEndpointNameSecret, awsRegionSecret],
}, async (request) => {
    try {
        const { imageData, projectId } = request.data;
        if (!imageData) {
            throw new https_1.HttpsError('invalid-argument', 'imageData is required');
        }
        if (!projectId) {
            throw new https_1.HttpsError('invalid-argument', 'projectId is required');
        }
        // Get credentials from secrets
        const credentials = {
            accessKeyId: awsAccessKeyIdSecret.value(),
            secretAccessKey: awsSecretAccessKeySecret.value(),
            endpointName: sagemakerEndpointNameSecret.value() || DEFAULT_ENDPOINT_NAME,
            region: awsRegionSecret.value() || DEFAULT_AWS_REGION,
        };
        console.log(`[SAGEMAKER] Processing annotation request for project: ${projectId}`);
        console.log(`[SAGEMAKER] Using endpoint: ${credentials.endpointName} in region: ${credentials.region}`);
        console.log(`[SAGEMAKER] Image data length: ${imageData.length} characters`);
        // Validate base64 image data
        try {
            // Basic validation - check if it's valid base64
            if (!/^[A-Za-z0-9+/=]+$/.test(imageData)) {
                throw new Error('Invalid base64 image data format');
            }
        }
        catch (validationError) {
            throw new https_1.HttpsError('invalid-argument', `Invalid image format: ${validationError instanceof Error ? validationError.message : String(validationError)}`);
        }
        // Invoke SageMaker endpoint
        const detections = await invokeSageMakerEndpoint(imageData, credentials);
        return {
            success: true,
            detections,
            message: detections.length > 0
                ? `Successfully detected ${detections.length} items`
                : 'No items detected in the image',
        };
    }
    catch (error) {
        console.error('[SAGEMAKER] Error:', error);
        if (error instanceof https_1.HttpsError) {
            throw error;
        }
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            success: false,
            detections: [],
            error: errorMessage,
            message: `Failed to invoke annotation endpoint: ${errorMessage}`,
        };
    }
});
//# sourceMappingURL=sagemakerInvoke.js.map