import * as fastifyTypeProviderZod from "fastify-type-provider-zod";
import fp from "fastify-plugin";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import fastifyBasicAuth from "@fastify/basic-auth";
import { FastifyInstance } from "fastify";
import { createHash, timingSafeEqual } from "node:crypto";
import { UnauthorizedError } from "@/lib/errors/errors.js";
import { FastifyPlugin } from "@/lib/constants/fastify.constant.js";
import {
    SWAGGER_API_TITLE,
    SWAGGER_API_VERSION,
    SWAGGER_BASIC_AUTH_USERNAME,
    SWAGGER_CREDENTIAL_DIGEST,
    SWAGGER_INVALID_CREDENTIALS_ERROR,
    SWAGGER_OPENAPI_VERSION,
    SWAGGER_ROUTE_PREFIX,
} from "@/lib/constants/swagger.constant.js";

/**
 * Constant-time comparison. Both sides are hashed first, so the buffers always
 * have the same length and the length of the secret does not leak either.
 */
const isSameSecret = (received: string, expected: string): boolean =>
    timingSafeEqual(
        createHash(SWAGGER_CREDENTIAL_DIGEST).update(received).digest(),
        createHash(SWAGGER_CREDENTIAL_DIGEST).update(expected).digest()
    );

/**
 * The OpenAPI document is always generated. The docs UI and its JSON/YAML
 * routes are behind basic auth when `DOCS_PASSWORD` is set; without it they
 * are open for local development and not registered at all in production.
 */
const configureSwagger = async (fastify: FastifyInstance) => {
    await fastify.register(fastifySwagger, {
        openapi: {
            openapi: SWAGGER_OPENAPI_VERSION,
            info: {
                title: SWAGGER_API_TITLE,
                version: SWAGGER_API_VERSION,
            },
        },
        transform: fastifyTypeProviderZod.jsonSchemaTransform,
    });

    const docsPassword = fastify.config.DOCS_PASSWORD;

    if (!docsPassword && fastify.config.NODE_ENV === "production") {
        fastify.log.warn("DOCS_PASSWORD is not set; the API docs are disabled");

        return;
    }

    if (docsPassword) {
        await fastify.register(fastifyBasicAuth, {
            validate(username, password, _req, _reply, done) {
                const validUsername = isSameSecret(
                    username,
                    SWAGGER_BASIC_AUTH_USERNAME
                );

                const validPassword = isSameSecret(password, docsPassword);

                if (validUsername && validPassword) {
                    done();

                    return;
                }

                done(new UnauthorizedError(SWAGGER_INVALID_CREDENTIALS_ERROR));
            },
            authenticate: true,
        });
    }

    await fastify.register(fastifySwaggerUi, {
        routePrefix: SWAGGER_ROUTE_PREFIX,
        uiHooks: {
            onRequest: docsPassword ? fastify.basicAuth : undefined,
        },
    });
};

export default fp(configureSwagger, {
    dependencies: [FastifyPlugin.Env],
    // Do not encapsulate to get the endpoints from the routes.
    encapsulate: false,
});
