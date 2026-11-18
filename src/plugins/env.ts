import fp from "fastify-plugin";
import fastifyEnv from "@fastify/env";
import { S } from "fluent-json-schema";
import { FastifyInstance } from "fastify";
import { FastifyPlugin } from "@/lib/constants/fastify.constant.js";
import { DEFAULT_TRUST_PROXY_HOPS } from "@/lib/constants/server.constant.js";
import {
    APPLICATION_SECRET_MIN_LENGTH,
    DEFAULT_AI_DAILY_LIMIT,
    DEFAULT_AI_GLOBAL_DAILY_LIMIT,
    DEFAULT_AI_TIMEOUT_MS,
} from "@/lib/constants/env.constant.js";

const configureEnv = async (fastify: FastifyInstance) => {
    await fastify.register(fastifyEnv, {
        schema: S.object()
            .prop(
                "NODE_ENV",
                S.string().enum(["development", "production", "test"])
            )
            .prop("DATABASE_URL", S.string())
            .prop(
                "APPLICATION_SECRET",
                S.string().minLength(APPLICATION_SECRET_MIN_LENGTH)
            )
            .prop("APPLICATION_URL", S.string())
            .prop("PORT", S.number())
            .prop("DOCS_PASSWORD", S.string())
            .prop("HOST", S.string().default("0.0.0.0"))
            .prop("FRONTEND_URL", S.string())
            .prop("LITEAPI_API_KEY", S.string())
            .prop(
                "LITEAPI_DATA_URL",
                S.string().default("https://api.liteapi.travel/v3.0")
            )
            .prop(
                "LITEAPI_BOOK_URL",
                S.string().default("https://book.liteapi.travel/v3.0")
            )
            .prop("LITEAPI_CURRENCY", S.string().default("EUR"))
            .prop("LITEAPI_GUEST_NATIONALITY", S.string().default("UA"))
            .prop("GCP_PROJECT_ID", S.string())
            .prop("AI_MODEL", S.string().default("gemini-3.8-flash"))
            .prop("AI_LOCATION", S.string().default("global"))
            .prop("AI_DAILY_LIMIT", S.number().default(DEFAULT_AI_DAILY_LIMIT))
            .prop(
                "AI_GLOBAL_DAILY_LIMIT",
                S.integer().default(DEFAULT_AI_GLOBAL_DAILY_LIMIT)
            )
            .prop("AI_TIMEOUT_MS", S.number().default(DEFAULT_AI_TIMEOUT_MS))
            .prop(
                "TRUST_PROXY_HOPS",
                S.number().default(DEFAULT_TRUST_PROXY_HOPS)
            )
            .required([
                "NODE_ENV",
                "DATABASE_URL",
                "APPLICATION_SECRET",
                "APPLICATION_URL",
                "PORT",
                "FRONTEND_URL",
                "LITEAPI_API_KEY",
            ])
            .valueOf(),
        dotenv: false,
    });
};

export default fp(configureEnv, {
    name: FastifyPlugin.Env,
});
