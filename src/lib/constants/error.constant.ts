export const INTERNAL_SERVER_ERROR_STATUS_CODE = 500;

export const INTERNAL_SERVER_ERROR_RESPONSE = {
    statusCode: INTERNAL_SERVER_ERROR_STATUS_CODE,
    code: "500",
    error: "Internal Server Error",
    message: "Internal Server Error",
} as const;

export const TOO_MANY_REQUESTS_STATUS_CODE = 429;

export const BAD_GATEWAY_STATUS_CODE = 502;

export const SERVICE_UNAVAILABLE_STATUS_CODE = 503;

export const GATEWAY_TIMEOUT_STATUS_CODE = 504;
