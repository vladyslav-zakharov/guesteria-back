import { AuthService } from "./auth.service.js";
import { EnvConfig } from "@/types/env.type.js";
import { FastifyReply, FastifyRequest } from "fastify";
import { SIGN_OUT_STATUS_CODE } from "./auth.constant.js";
import { addDIResolverName } from "@/lib/awilix/awilix.js";
import { CREATED_STATUS_CODE } from "@/lib/constants/http.constant.js";
import { SignInInput, SignUpInput } from "@/lib/validation/auth/auth.schema.js";
import {
    AUTH_COOKIE_NAME,
    AUTH_TOKEN_TTL_SECONDS,
} from "@/lib/constants/auth.constant.js";

export type AuthHandler = {
    signUp: (
        request: FastifyRequest<{ Body: SignUpInput }>,
        reply: FastifyReply
    ) => Promise<void>;
    signIn: (
        request: FastifyRequest<{ Body: SignInInput }>,
        reply: FastifyReply
    ) => Promise<void>;
    signOut: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    me: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
};

export const createHandler = (
    authService: AuthService,
    config: EnvConfig
): AuthHandler => {
    const cookieOptions = {
        httpOnly: true,
        secure: config.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: AUTH_TOKEN_TTL_SECONDS,
    } as const;

    return {
        signUp: async (request, reply) => {
            const user = await authService.signUp({ payload: request.body });
            const token = await reply.jwtSign({ sub: user.id });

            return reply
                .setCookie(AUTH_COOKIE_NAME, token, cookieOptions)
                .status(CREATED_STATUS_CODE)
                .send({ user });
        },

        signIn: async (request, reply) => {
            const user = await authService.signIn({ payload: request.body });
            const token = await reply.jwtSign({ sub: user.id });

            return reply
                .setCookie(AUTH_COOKIE_NAME, token, cookieOptions)
                .send({ user });
        },

        signOut: async (_request, reply) => {
            return reply
                .clearCookie(AUTH_COOKIE_NAME, { path: "/" })
                .status(SIGN_OUT_STATUS_CODE)
                .send();
        },

        me: async (request, reply) => {
            return reply.send({ user: request.user });
        },
    };
};

addDIResolverName(createHandler, "authHandler");
