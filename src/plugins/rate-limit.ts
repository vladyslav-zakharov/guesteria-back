import fp from "fastify-plugin";
import fastifyRateLimit from "@fastify/rate-limit";
import { FastifyInstance } from "fastify";
import { TooManyRequestsError } from "@/lib/errors/errors.js";
import { FastifyPlugin } from "@/lib/constants/fastify.constant.js";
import { RESPONSE_MESSAGES } from "@/lib/messages/messages.constant.js";

const configureRateLimit = async (fastify: FastifyInstance) => {
    await fastify.register(fastifyRateLimit, {
        global: false,
        keyGenerator: (request) => request.user?.id ?? request.ip,
        /**
         * Returns an Error instance, not a plain object: the plugin throws what this
         * returns, and only an Error makes the error handler use its 429 status
         * instead of serializing it against the route's 200 response schema.
         */
        errorResponseBuilder: () =>
            new TooManyRequestsError(RESPONSE_MESSAGES.common.tooManyRequests),
    });
};

export default fp(configureRateLimit, { name: FastifyPlugin.RateLimit });
