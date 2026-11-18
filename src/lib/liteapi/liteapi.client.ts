import { FastifyBaseLogger } from "fastify";
import { EnvConfig } from "@/types/env.type.js";
import { mapLiteApiError } from "./liteapi.error.js";
import { createTtlCache } from "@/lib/cache/ttl-cache.js";
import { createThrottle } from "@/lib/throttle/throttle.js";
import { RESPONSE_MESSAGES } from "@/lib/messages/messages.constant.js";
import { LiteApiClient, LiteRequest, LiteResponse } from "./liteapi.type.js";
import {
    BadGatewayError,
    BookingOutcomeUnknownError,
    GatewayTimeoutError,
    NotFoundError,
    ServiceUnavailableError,
} from "@/lib/errors/errors.js";
import {
    LiteHotelDetails,
    LiteHotelSummary,
    LitePlace,
    liteBookingIdProbeSchema,
    liteBookingResponseSchema,
    liteErrorEnvelopeSchema,
    liteHotelDetailsResponseSchema,
    liteHotelsResponseSchema,
    litePlacesResponseSchema,
    litePrebookResponseSchema,
    liteRatesResponseSchema,
} from "@/lib/validation/liteapi/liteapi.schema.js";
import {
    BOOK_TIMEOUT_MS,
    BOOKING_OCCUPANCY_NUMBER,
    BOOKING_PAYMENT_METHOD,
    CACHE_MAX_ENTRIES,
    DATA_TIMEOUT_MS,
    HOTEL_DATA_TTL_MS,
    HOTELS_BY_PLACE_LIMIT,
    INVALID_INPUT_CODE,
    NO_AVAILABILITY_CODE,
    MAX_LOGGED_ISSUES,
    PLACES_TTL_MS,
    PREBOOK_TIMEOUT_MS,
    PREBOOK_UPSTREAM_TIMEOUT_SECONDS,
    RATES_TIMEOUT_MS,
    RATES_UPSTREAM_TIMEOUT_SECONDS,
    SEARCH_MAX_WAIT_MS,
    SEARCH_RATE_LIMIT,
    SEARCH_RATE_WINDOW_MS,
    TIMEOUT_ERROR_NAME,
} from "./liteapi.constant.js";

/**
 * Typed LiteAPI client. Security notes:
 * - the API key is sent only in the `X-API-Key` header and is never logged;
 * - logs carry `{ path, httpStatus, code }` only: no query string, no body,
 *   no guest data, no upstream message;
 * - every upstream failure is mapped to one of our errors with a message from
 *   RESPONSE_MESSAGES, so nothing from LiteAPI is echoed to the client;
 * - search-side calls (places, hotels, rates, hotel details) share an
 *   in-process budget below the key's 5 req/s, so a burst (or rotated
 *   X-Forwarded-For on direct Cloud Run calls) cannot starve prebook and book,
 *   which bypass it. Cache hits never spend the budget.
 */
export const createLiteApiClient = (
    config: EnvConfig,
    log: FastifyBaseLogger
): LiteApiClient => {
    const placesCache = createTtlCache<LitePlace[]>({
        max: CACHE_MAX_ENTRIES,
        ttlMs: PLACES_TTL_MS,
    });

    const hotelsCache = createTtlCache<LiteHotelSummary[]>({
        max: CACHE_MAX_ENTRIES,
        ttlMs: HOTEL_DATA_TTL_MS,
    });

    const hotelCache = createTtlCache<LiteHotelDetails>({
        max: CACHE_MAX_ENTRIES,
        ttlMs: HOTEL_DATA_TTL_MS,
    });

    const searchThrottle = createThrottle({
        limit: SEARCH_RATE_LIMIT,
        windowMs: SEARCH_RATE_WINDOW_MS,
        maxWaitMs: SEARCH_MAX_WAIT_MS,
    });

    const dataUrl = (path: string): URL =>
        new URL(`${config.LITEAPI_DATA_URL}${path}`);

    const bookUrl = (path: string): URL =>
        new URL(`${config.LITEAPI_BOOK_URL}${path}`);

    const send = async ({
        url,
        init,
        timeoutMs,
        bypassThrottle,
    }: Omit<LiteRequest<unknown>, "schema">): Promise<LiteResponse> => {
        if (!bypassThrottle && !(await searchThrottle.acquire())) {
            log.warn({ path: url.pathname }, "LiteAPI search budget exhausted");

            throw new ServiceUnavailableError(
                RESPONSE_MESSAGES.liteapi.searchBusy
            );
        }

        let response: Response;

        try {
            response = await fetch(url, {
                method: init?.method ?? "GET",
                body: init?.body,
                headers: {
                    "X-API-Key": config.LITEAPI_API_KEY,
                    "Content-Type": "application/json",
                    accept: "application/json",
                },
                signal: AbortSignal.timeout(timeoutMs),
            });
        } catch (error) {
            const reason = error instanceof Error ? error.name : "unknown";

            log.error({ path: url.pathname, reason }, "LiteAPI request failed");

            throw reason === TIMEOUT_ERROR_NAME
                ? new GatewayTimeoutError(RESPONSE_MESSAGES.liteapi.timeout)
                : new BadGatewayError(RESPONSE_MESSAGES.liteapi.upstream);
        }

        const body: unknown = await response.json().catch(() => null);
        const envelope = liteErrorEnvelopeSchema.safeParse(body);

        return {
            ok: response.ok,
            httpStatus: response.status,
            body,
            upstreamCode: envelope.success ? envelope.data.error.code : null,
        };
    };

    const parse = <T>({
        url,
        response,
        schema,
    }: {
        url: URL;
        response: LiteResponse;
        schema: LiteRequest<T>["schema"];
    }): T => {
        const { ok, httpStatus, upstreamCode, body } = response;

        if (!ok || upstreamCode !== null) {
            log.warn(
                { path: url.pathname, httpStatus, code: upstreamCode },
                "LiteAPI error"
            );

            throw mapLiteApiError({ httpStatus, code: upstreamCode });
        }

        const parsed = schema.safeParse(body);

        if (!parsed.success) {
            log.error(
                {
                    path: url.pathname,
                    issues: parsed.error.issues
                        .slice(0, MAX_LOGGED_ISSUES)
                        .map((issue) => ({
                            path: issue.path.join("."),
                            code: issue.code,
                        })),
                },
                "LiteAPI response shape changed"
            );

            throw new BadGatewayError(RESPONSE_MESSAGES.liteapi.upstream);
        }

        return parsed.data;
    };

    const request = async <T>({
        url,
        init,
        schema,
        timeoutMs,
        bypassThrottle,
    }: LiteRequest<T>): Promise<T> => {
        const response = await send({ url, init, timeoutMs, bypassThrottle });

        return parse({ url, response, schema });
    };

    return {
        searchPlaces: async (query) => {
            const key = query.trim().toLowerCase();
            const cached = placesCache.get(key);

            if (cached) {
                return cached;
            }

            const url = dataUrl("/data/places");

            url.searchParams.set("textQuery", key);

            const { data } = await request({
                url,
                schema: litePlacesResponseSchema,
                timeoutMs: DATA_TIMEOUT_MS,
            });

            return placesCache.set({ key, value: data });
        },

        getHotelsByPlace: async (placeId) => {
            const cached = hotelsCache.get(placeId);

            if (cached) {
                return cached;
            }

            const url = dataUrl("/data/hotels");

            url.searchParams.set("placeId", placeId);
            url.searchParams.set("limit", String(HOTELS_BY_PLACE_LIMIT));

            const { data } = await request({
                url,
                schema: liteHotelsResponseSchema,
                timeoutMs: DATA_TIMEOUT_MS,
            });

            return hotelsCache.set({ key: placeId, value: data });
        },

        getRates: async ({
            hotelIds,
            checkin,
            checkout,
            occupancy,
            maxRatesPerHotel,
        }) => {
            const url = dataUrl("/hotels/rates");

            const response = await send({
                url,
                init: {
                    method: "POST",
                    body: JSON.stringify({
                        hotelIds,
                        occupancies: [
                            {
                                adults: occupancy.adults,
                                children: occupancy.children,
                            },
                        ],
                        currency: config.LITEAPI_CURRENCY,
                        guestNationality: config.LITEAPI_GUEST_NATIONALITY,
                        checkin,
                        checkout,
                        timeout: RATES_UPSTREAM_TIMEOUT_SECONDS,
                        maxRatesPerHotel,
                    }),
                },
                timeoutMs: RATES_TIMEOUT_MS,
            });

            if (response.upstreamCode === NO_AVAILABILITY_CODE) {
                return [];
            }

            const { data } = parse({
                url,
                response,
                schema: liteRatesResponseSchema,
            });

            return data;
        },

        getHotel: async (hotelId) => {
            const cached = hotelCache.get(hotelId);

            if (cached) {
                return cached;
            }

            const url = dataUrl("/data/hotel");

            url.searchParams.set("hotelId", hotelId);

            const response = await send({ url, timeoutMs: DATA_TIMEOUT_MS });

            /**
             * The sandbox answers an unknown hotel id with HTTP 400 + 4002
             * ("hotelId is missing or invalid"), not 404. hotelId is the only
             * input here and the route already validates its format, so 4002
             * means "no such hotel". Other endpoints keep 4002 → 502.
             */
            if (response.upstreamCode === INVALID_INPUT_CODE) {
                log.warn(
                    {
                        path: url.pathname,
                        httpStatus: response.httpStatus,
                        code: response.upstreamCode,
                    },
                    "LiteAPI unknown hotel"
                );

                throw new NotFoundError(RESPONSE_MESSAGES.liteapi.notFound);
            }

            const { data } = parse({
                url,
                response,
                schema: liteHotelDetailsResponseSchema,
            });

            return hotelCache.set({ key: hotelId, value: data });
        },

        prebook: async (offerId) => {
            const url = bookUrl("/rates/prebook");

            url.searchParams.set(
                "timeout",
                String(PREBOOK_UPSTREAM_TIMEOUT_SECONDS)
            );

            const { data } = await request({
                url,
                init: {
                    method: "POST",
                    body: JSON.stringify({ offerId, usePaymentSdk: false }),
                },
                schema: litePrebookResponseSchema,
                timeoutMs: PREBOOK_TIMEOUT_MS,
                bypassThrottle: true,
            });

            return data;
        },

        /**
         * A 4xx/5xx or an error envelope proves nothing was booked and maps as
         * usual. A 2xx whose body cannot be read or parsed is an unknown
         * outcome: it throws BookingOutcomeUnknownError and logs
         * `clientReference` and any readable LiteAPI booking id.
         */
        book: async ({ prebookId, clientReference, guest }) => {
            const url = bookUrl("/rates/book");

            const response = await send({
                url,
                init: {
                    method: "POST",
                    body: JSON.stringify({
                        prebookId,
                        clientReference,
                        holder: {
                            firstName: guest.firstName,
                            lastName: guest.lastName,
                            email: guest.email,
                            phone: guest.phone,
                        },
                        guests: [
                            {
                                occupancyNumber: BOOKING_OCCUPANCY_NUMBER,
                                firstName: guest.firstName,
                                lastName: guest.lastName,
                                email: guest.email,
                            },
                        ],
                        payment: { method: BOOKING_PAYMENT_METHOD },
                    }),
                },
                timeoutMs: BOOK_TIMEOUT_MS,
                bypassThrottle: true,
            });

            if (!response.ok || response.upstreamCode !== null) {
                return parse({
                    url,
                    response,
                    schema: liteBookingResponseSchema,
                }).data;
            }

            const parsed = liteBookingResponseSchema.safeParse(response.body);

            if (parsed.success) {
                return parsed.data.data;
            }

            const probe = liteBookingIdProbeSchema.safeParse(response.body);

            log.error(
                {
                    path: url.pathname,
                    httpStatus: response.httpStatus,
                    clientReference,
                    liteBookingId: probe.success
                        ? probe.data.data.bookingId
                        : null,
                },
                "LiteAPI book outcome unknown: 2xx without a readable booking"
            );

            throw new BookingOutcomeUnknownError(
                RESPONSE_MESSAGES.booking.notConfirmed
            );
        },
    };
};
