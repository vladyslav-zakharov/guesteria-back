import { FastifyReply, FastifyRequest } from "fastify";
import { BookingsService } from "./bookings.service.js";
import { addDIResolverName } from "@/lib/awilix/awilix.js";
import { CREATED_STATUS_CODE } from "@/lib/constants/http.constant.js";
import {
    BookInput,
    BookingParams,
    PrebookInput,
} from "@/lib/validation/bookings/bookings.schema.js";

export type BookingsHandler = {
    prebook: (
        request: FastifyRequest<{ Body: PrebookInput }>,
        reply: FastifyReply
    ) => Promise<void>;
    book: (
        request: FastifyRequest<{ Body: BookInput }>,
        reply: FastifyReply
    ) => Promise<void>;
    listBookings: (
        request: FastifyRequest,
        reply: FastifyReply
    ) => Promise<void>;
    getBooking: (
        request: FastifyRequest<{ Params: BookingParams }>,
        reply: FastifyReply
    ) => Promise<void>;
};

export const createHandler = (
    bookingsService: BookingsService
): BookingsHandler => {
    return {
        prebook: async (request, reply) => {
            const prebook = await bookingsService.prebook({
                userId: request.user.id,
                payload: request.body,
            });

            return reply.status(CREATED_STATUS_CODE).send({ prebook });
        },

        book: async (request, reply) => {
            const booking = await bookingsService.book({
                userId: request.user.id,
                payload: request.body,
            });

            return reply.status(CREATED_STATUS_CODE).send({ booking });
        },

        listBookings: async (request, reply) => {
            const bookings = await bookingsService.listBookings({
                userId: request.user.id,
            });

            return reply.send({ bookings });
        },

        getBooking: async (request, reply) => {
            const booking = await bookingsService.getBooking({
                userId: request.user.id,
                bookingId: request.params.bookingId,
            });

            return reply.send({ booking });
        },
    };
};

addDIResolverName(createHandler, "bookingsHandler");
