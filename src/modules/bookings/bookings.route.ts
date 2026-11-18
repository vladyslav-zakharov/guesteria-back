import { FastifyInstance } from "fastify";
import { BookingsHandler } from "./bookings.handler.js";
import {
    BOOK_RATE_LIMIT_MAX,
    BOOKINGS_RATE_LIMIT_TIME_WINDOW,
    PREBOOK_RATE_LIMIT_MAX,
} from "./bookings.constant.js";
import {
    BookInput,
    BookingParams,
    PrebookInput,
    bookBodySchema,
    bookingParamsSchema,
    bookingResponseSchema,
    bookingsResponseSchema,
    prebookBodySchema,
    prebookResponseSchema,
} from "@/lib/validation/bookings/bookings.schema.js";

const BOOKINGS_TAG = "bookings";

enum BookingsRoute {
    Root = "/",
    Prebook = "/prebook",
    Booking = "/:bookingId",
}

/**
 * `authorization` runs in `onRequest`, so an unauthenticated request gets 401
 * before body validation. The rate limiters run as preHandlers after it, so
 * they are keyed by the signed-in user id, not by IP.
 */
export const createBookingsRoutes = (
    fastify: FastifyInstance,
    bookingsHandler: BookingsHandler
) => {
    fastify.post<{ Body: PrebookInput }>(
        BookingsRoute.Prebook,
        {
            onRequest: [fastify.authorization],
            preHandler: [
                fastify.rateLimit({
                    max: PREBOOK_RATE_LIMIT_MAX,
                    timeWindow: BOOKINGS_RATE_LIMIT_TIME_WINDOW,
                }),
            ],
            schema: {
                tags: [BOOKINGS_TAG],
                summary:
                    "Confirm the price of an offer (can take up to a minute)",
                body: prebookBodySchema,
                response: {
                    201: prebookResponseSchema,
                },
            },
        },
        bookingsHandler.prebook
    );

    fastify.post<{ Body: BookInput }>(
        BookingsRoute.Root,
        {
            onRequest: [fastify.authorization],
            preHandler: [
                fastify.rateLimit({
                    max: BOOK_RATE_LIMIT_MAX,
                    timeWindow: BOOKINGS_RATE_LIMIT_TIME_WINDOW,
                }),
            ],
            schema: {
                tags: [BOOKINGS_TAG],
                summary: "Book a prebooked offer",
                body: bookBodySchema,
                response: {
                    201: bookingResponseSchema,
                },
            },
        },
        bookingsHandler.book
    );

    fastify.get(
        BookingsRoute.Root,
        {
            onRequest: [fastify.authorization],
            schema: {
                tags: [BOOKINGS_TAG],
                summary: "List the signed-in user's bookings (up to 100)",
                response: {
                    200: bookingsResponseSchema,
                },
            },
        },
        bookingsHandler.listBookings
    );

    fastify.get<{ Params: BookingParams }>(
        BookingsRoute.Booking,
        {
            onRequest: [fastify.authorization],
            schema: {
                tags: [BOOKINGS_TAG],
                summary: "Get one of the signed-in user's bookings",
                params: bookingParamsSchema,
                response: {
                    200: bookingResponseSchema,
                },
            },
        },
        bookingsHandler.getBooking
    );
};
