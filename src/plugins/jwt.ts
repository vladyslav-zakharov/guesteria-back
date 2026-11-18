import fp from "fastify-plugin";
import fastifyJWT from "@fastify/jwt";
import fastifyCookie from "@fastify/cookie";
import { FastifyInstance, FastifyRequest } from "fastify";
import { UnauthorizedError } from "@/lib/errors/errors.js";
import { FastifyPlugin } from "@/lib/constants/fastify.constant.js";
import { RESPONSE_MESSAGES } from "@/lib/messages/messages.constant.js";
import {
    AUTH_COOKIE_NAME,
    AUTH_TOKEN_TTL_SECONDS,
} from "@/lib/constants/auth.constant.js";

const configureJwt = async (fastify: FastifyInstance) => {
    await fastify.register(fastifyCookie);

    await fastify.register(fastifyJWT, {
        secret: fastify.config.APPLICATION_SECRET,
        cookie: { cookieName: AUTH_COOKIE_NAME, signed: false },
        sign: { expiresIn: AUTH_TOKEN_TTL_SECONDS },
    });

    /**
     * Verifies the cookie JWT and reloads the user on every request, so a deleted
     * user loses access immediately. Every failure is the same 401.
     */
    fastify.decorate("authorization", async (request: FastifyRequest) => {
        let sub: string;

        try {
            ({ sub } = await request.jwtVerify<{ sub: string }>());
        } catch {
            throw new UnauthorizedError(RESPONSE_MESSAGES.auth.unauthorized);
        }

        const user = await fastify.di.resolve("userRepository").findUnique({
            where: { id: sub },
            select: { id: true, email: true, firstName: true, lastName: true },
        });

        if (!user) {
            throw new UnauthorizedError(RESPONSE_MESSAGES.auth.unauthorized);
        }

        request.user = user;
    });
};

export default fp(configureJwt, {
    name: FastifyPlugin.Jwt,
    dependencies: [FastifyPlugin.Env, FastifyPlugin.Awilix],
});
