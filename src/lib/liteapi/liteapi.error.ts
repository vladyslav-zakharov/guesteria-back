import { LiteApiErrorInput } from "./liteapi.type.js";
import { RESPONSE_MESSAGES } from "@/lib/messages/messages.constant.js";
import {
    BadGatewayError,
    ConflictError,
    GatewayTimeoutError,
    NotFoundError,
    ServiceUnavailableError,
} from "@/lib/errors/errors.js";
import {
    LITEAPI_HTTP_NOT_FOUND,
    LITEAPI_HTTP_TOO_MANY_REQUESTS,
    NO_AVAILABILITY_CODE,
    NOT_FOUND_CODE,
    OFFER_UNAVAILABLE_CODE,
    UPSTREAM_TIMEOUT_CODE,
} from "./liteapi.constant.js";

/**
 * Maps a LiteAPI failure to one of our HTTP errors. The upstream message is never
 * passed through: the client only ever sees a message from RESPONSE_MESSAGES.liteapi.
 */
export const mapLiteApiError = ({
    httpStatus,
    code,
}: LiteApiErrorInput): Error => {
    if (code === UPSTREAM_TIMEOUT_CODE) {
        return new GatewayTimeoutError(RESPONSE_MESSAGES.liteapi.timeout);
    }

    if (code === NO_AVAILABILITY_CODE || code === OFFER_UNAVAILABLE_CODE) {
        return new ConflictError(RESPONSE_MESSAGES.liteapi.soldOut);
    }

    if (code === NOT_FOUND_CODE || httpStatus === LITEAPI_HTTP_NOT_FOUND) {
        return new NotFoundError(RESPONSE_MESSAGES.liteapi.notFound);
    }

    if (httpStatus === LITEAPI_HTTP_TOO_MANY_REQUESTS) {
        return new ServiceUnavailableError(RESPONSE_MESSAGES.liteapi.busy);
    }

    return new BadGatewayError(RESPONSE_MESSAGES.liteapi.upstream);
};
