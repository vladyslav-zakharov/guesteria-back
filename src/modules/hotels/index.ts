import { FastifyInstance } from "fastify";
import { createHotelsRoutes } from "./hotels.route.js";

// Define the endpoint prefix by providing autoPrefix module property.
export const autoPrefix = "/api/hotels";

export default async function (fastify: FastifyInstance) {
    const hotelsHandler = fastify.di.resolve("hotelsHandler");
    createHotelsRoutes(fastify, hotelsHandler);
}
