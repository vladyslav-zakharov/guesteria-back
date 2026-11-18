import { z } from "zod";
import { AuthHandler } from "./auth.handler.js";
import { FastifyInstance, FastifyRequest } from "fastify";
import { TooManyRequestsError } from "@/lib/errors/errors.js";
import { RESPONSE_MESSAGES } from "@/lib/messages/messages.constant.js";
import {
    SignInInput,
    authUserResponseSchema,
    signInBodySchema,
    signInEmailSchema,
    signUpBodySchema,
} from "@/lib/validation/auth/auth.schema.js";
import {
    AUTH_RATE_LIMIT_MAX,
    AUTH_RATE_LIMIT_TIME_WINDOW,
    SIGN_IN_EMAIL_RATE_LIMIT_MAX,
    SIGN_IN_EMAIL_RATE_LIMIT_TIME_WINDOW,
} from "./auth.constant.js";

const AUTH_TAG = "auth";

enum AuthRoute {
    SignUp = "/sign-up",
    SignIn = "/sign-in",
    SignOut = "/sign-out",
    Me = "/me",
}

const publicRateLimit = {
    rateLimit: {
        max: AUTH_RATE_LIMIT_MAX,
        timeWindow: AUTH_RATE_LIMIT_TIME_WINDOW,
    },
};

/**
 * Keys the per-email sign-in limit by the trimmed, lower-cased email from the
 * parsed body, so rotating IPs (or a spoofed X-Forwarded-For) cannot spread
 * guesses for one account. It applies to known and unknown emails alike and
 * answers with the shared 429, so it does not reveal whether an account exists.
 */
const signInEmailKey = (request: FastifyRequest): string => {
    const parsed = signInEmailSchema.safeParse(request.body);

    return parsed.success ? parsed.data.email : request.ip;
};

export const createAuthRoutes = (
    fastify: FastifyInstance,
    authHandler: AuthHandler
) => {
    const checkSignInEmailLimit = fastify.createRateLimit({
        max: SIGN_IN_EMAIL_RATE_LIMIT_MAX,
        timeWindow: SIGN_IN_EMAIL_RATE_LIMIT_TIME_WINDOW,
        keyGenerator: signInEmailKey,
    });

    /**
     * A second limiter on top of the per-IP one. `fastify.rateLimit` runs only
     * once per request (the per-IP limiter already claims that slot), so this
     * one uses `createRateLimit` and throws the shared 429 itself.
     */
    const limitSignInByEmail = async (request: FastifyRequest) => {
        const limit = await checkSignInEmailLimit(request);

        if (!limit.isAllowed && limit.isExceeded) {
            throw new TooManyRequestsError(
                RESPONSE_MESSAGES.common.tooManyRequests
            );
        }
    };

    fastify.post(
        AuthRoute.SignUp,
        {
            config: publicRateLimit,
            schema: {
                tags: [AUTH_TAG],
                summary: "Create an account and start a session",
                body: signUpBodySchema,
                response: {
                    201: authUserResponseSchema,
                },
            },
        },
        authHandler.signUp
    );

    fastify.post<{ Body: SignInInput }>(
        AuthRoute.SignIn,
        {
            config: publicRateLimit,
            preHandler: [limitSignInByEmail],
            schema: {
                tags: [AUTH_TAG],
                summary: "Sign in and start a session",
                body: signInBodySchema,
                response: {
                    200: authUserResponseSchema,
                },
            },
        },
        authHandler.signIn
    );

    fastify.post(
        AuthRoute.SignOut,
        {
            schema: {
                tags: [AUTH_TAG],
                summary: "Clear the session cookie",
                response: {
                    204: z.null(),
                },
            },
        },
        authHandler.signOut
    );

    fastify.get(
        AuthRoute.Me,
        {
            onRequest: [fastify.authorization],
            schema: {
                tags: [AUTH_TAG],
                summary: "Get the signed-in user",
                response: {
                    200: authUserResponseSchema,
                },
            },
        },
        authHandler.me
    );
};
