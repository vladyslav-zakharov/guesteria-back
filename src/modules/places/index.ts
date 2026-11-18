import { FastifyInstance } from "fastify";
import { createPlacesRoutes } from "./places.route.js";

// Define the endpoint prefix by providing autoPrefix module property.
export const autoPrefix = "/api/places";

export default async function (fastify: FastifyInstance) {
    const placesHandler = fastify.di.resolve("placesHandler");
    createPlacesRoutes(fastify, placesHandler);
}
