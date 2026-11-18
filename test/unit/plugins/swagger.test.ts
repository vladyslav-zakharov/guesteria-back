import fp from "fastify-plugin";
import Fastify, { FastifyInstance } from "fastify";
import { EnvConfig } from "@/types/env.type.js";
import configureSwagger from "@/plugins/swagger.js";
import { afterEach, describe, expect, it } from "vitest";
import { FastifyPlugin } from "@/lib/constants/fastify.constant.js";
import {
    SWAGGER_BASIC_AUTH_USERNAME,
    SWAGGER_ROUTE_PREFIX,
} from "@/lib/constants/swagger.constant.js";

const DOCS_PASSWORD = "docs-password-for-tests";
const DOCS_JSON = `${SWAGGER_ROUTE_PREFIX}/json`;

let app: FastifyInstance | undefined;

const build = async (config: Pick<EnvConfig, "NODE_ENV" | "DOCS_PASSWORD">) => {
    app = Fastify();

    await app.register(
        fp(
            async (fastify) => {
                fastify.decorate("config", config as EnvConfig);
            },
            { name: FastifyPlugin.Env }
        )
    );
    await app.register(configureSwagger);
    await app.ready();

    return app;
};

const basic = (username: string, password: string) =>
    `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;

afterEach(async () => {
    await app?.close();
    app = undefined;
});

describe("swagger docs", () => {
    it("does not register the docs routes in production without DOCS_PASSWORD", async () => {
        const server = await build({
            NODE_ENV: "production",
            DOCS_PASSWORD: "",
        });

        const response = await server.inject({ method: "GET", url: DOCS_JSON });

        expect(response.statusCode).toBe(404);
    });

    it("serves the docs without auth in development without DOCS_PASSWORD", async () => {
        const server = await build({
            NODE_ENV: "development",
            DOCS_PASSWORD: undefined,
        });

        const response = await server.inject({ method: "GET", url: DOCS_JSON });

        expect(response.statusCode).toBe(200);
    });

    it.each([
        ["no credentials", undefined],
        [
            "a wrong password of the same length",
            basic(
                SWAGGER_BASIC_AUTH_USERNAME,
                "x".repeat(DOCS_PASSWORD.length)
            ),
        ],
        [
            "a wrong password of another length",
            basic(SWAGGER_BASIC_AUTH_USERNAME, "short"),
        ],
        ["a wrong username", basic("root", DOCS_PASSWORD)],
    ])("answers 401 with %s", async (_label, authorization) => {
        const server = await build({ NODE_ENV: "production", DOCS_PASSWORD });

        const response = await server.inject({
            method: "GET",
            url: DOCS_JSON,
            headers: authorization ? { authorization } : {},
        });

        expect(response.statusCode).toBe(401);
    });

    it("serves the docs with the right credentials", async () => {
        const server = await build({ NODE_ENV: "production", DOCS_PASSWORD });

        const response = await server.inject({
            method: "GET",
            url: DOCS_JSON,
            headers: {
                authorization: basic(
                    SWAGGER_BASIC_AUTH_USERNAME,
                    DOCS_PASSWORD
                ),
            },
        });

        expect(response.statusCode).toBe(200);
    });
});
