export const PLACES_TTL_MS = 600_000;

export const HOTEL_DATA_TTL_MS = 3_600_000;

export const CACHE_MAX_ENTRIES = 500;

export const HOTELS_BY_PLACE_LIMIT = 50;

export const DATA_TIMEOUT_MS = 10_000;

export const RATES_TIMEOUT_MS = 12_000;

export const RATES_UPSTREAM_TIMEOUT_SECONDS = 8;

export const PREBOOK_UPSTREAM_TIMEOUT_SECONDS = 60;

export const PREBOOK_TIMEOUT_MS = 65_000;

export const BOOK_TIMEOUT_MS = 70_000;

export const BOOKING_OCCUPANCY_NUMBER = 1;

export const BOOKING_PAYMENT_METHOD = "ACC_CREDIT_CARD";

export const REFUNDABLE_TAG = "RFN";

export const HTTPS_PROTOCOL = "https:";

export const NO_AVAILABILITY_CODE = 2001;

export const INVALID_INPUT_CODE = 4002;

export const NOT_FOUND_CODE = 4004;

export const UPSTREAM_TIMEOUT_CODE = 4016;

export const OFFER_UNAVAILABLE_CODE = 4040;

export const LITEAPI_HTTP_NOT_FOUND = 404;

export const LITEAPI_HTTP_TOO_MANY_REQUESTS = 429;

export const TIMEOUT_ERROR_NAME = "TimeoutError";

export const HTML_ENTITIES: Readonly<Record<string, string>> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
};

export const HEX_RADIX = 16;

export const CANCEL_TIME_FORMATS = [
    "YYYY-MM-DD HH:mm:ss",
    "YYYY-MM-DD HH:mm",
    "YYYY-MM-DDTHH:mm:ss",
    "YYYY-MM-DDTHH:mm",
];

export const UTC_SUFFIX = "Z";

export const MINUTES_PER_HOUR = 60;

export const TIMEZONE_PATTERN =
    /^(?:GMT|UTC)?(?:([+-])(\d{1,2})(?::?(\d{2}))?)?$/i;

export const MAX_CODE_POINT = 0x10ffff;

export const MAX_LOGGED_ISSUES = 5;

export const HEX_ENTITY_PREFIX = "#x";

/**
 * The sandbox key allows 5 req/s across every endpoint. Cloud Run runs at most
 * one instance (`max_instance_count = 1`), so search-side calls get 3 req/s
 * and prebook/book keep the other 2 by bypassing the budget.
 */
export const SEARCH_RATE_LIMIT = 3;

export const SEARCH_RATE_WINDOW_MS = 1000;

export const SEARCH_MAX_WAIT_MS = 2000;
