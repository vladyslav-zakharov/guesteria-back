import createError from "@fastify/error";
import {
    BAD_GATEWAY_STATUS_CODE,
    GATEWAY_TIMEOUT_STATUS_CODE,
    SERVICE_UNAVAILABLE_STATUS_CODE,
    TOO_MANY_REQUESTS_STATUS_CODE,
} from "@/lib/constants/error.constant.js";

const BadRequestError = createError("400", "%s", 400);

const NotFoundError = createError("404", "%s", 404);

const ForbiddenError = createError("403", "%s", 403);

const UnauthorizedError = createError("401", "%s", 401);

const ConflictError = createError("409", "%s", 409);

const TooManyRequestsError = createError(
    String(TOO_MANY_REQUESTS_STATUS_CODE),
    "%s",
    TOO_MANY_REQUESTS_STATUS_CODE
);

const DailyLimitError = createError(
    "DAILY_LIMIT_REACHED",
    "%s",
    TOO_MANY_REQUESTS_STATUS_CODE
);

const InternalServerError = createError("500", "%s", 500);

const BadGatewayError = createError(
    String(BAD_GATEWAY_STATUS_CODE),
    "%s",
    BAD_GATEWAY_STATUS_CODE
);

const ServiceUnavailableError = createError(
    String(SERVICE_UNAVAILABLE_STATUS_CODE),
    "%s",
    SERVICE_UNAVAILABLE_STATUS_CODE
);

const GatewayTimeoutError = createError(
    String(GATEWAY_TIMEOUT_STATUS_CODE),
    "%s",
    GATEWAY_TIMEOUT_STATUS_CODE
);

/**
 * LiteAPI answered 2xx to a book call, but the body could not be read or
 * parsed: the booking may exist upstream, so the caller must not assume it
 * failed.
 */
const BookingOutcomeUnknownError = createError(
    "BOOKING_OUTCOME_UNKNOWN",
    "%s",
    BAD_GATEWAY_STATUS_CODE
);

const DefaultInternalServerError = createError(
    "500",
    "Internal Server Error",
    500
);

export {
    NotFoundError,
    ForbiddenError,
    UnauthorizedError,
    ConflictError,
    TooManyRequestsError,
    DailyLimitError,
    DefaultInternalServerError,
    BadRequestError,
    InternalServerError,
    BadGatewayError,
    ServiceUnavailableError,
    GatewayTimeoutError,
    BookingOutcomeUnknownError,
};
