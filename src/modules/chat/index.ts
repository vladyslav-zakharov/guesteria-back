import { FastifyInstance } from "fastify";
import { createChatRoutes } from "./chat.route.js";

// Define the endpoint prefix by providing autoPrefix module property.
export const autoPrefix = "/api/bookings";

export default async function (fastify: FastifyInstance) {
    const chatHandler = fastify.di.resolve("chatHandler");
    createChatRoutes(fastify, chatHandler);
}
