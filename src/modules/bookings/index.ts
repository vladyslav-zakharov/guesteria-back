import { FastifyInstance } from "fastify";
import { createBookingsRoutes } from "./bookings.route.js";

// Define the endpoint prefix by providing autoPrefix module property.
export const autoPrefix = "/api/bookings";

export default async function (fastify: FastifyInstance) {
    const bookingsHandler = fastify.di.resolve("bookingsHandler");
    createBookingsRoutes(fastify, bookingsHandler);
}
