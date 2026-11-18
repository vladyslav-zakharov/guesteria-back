import path from "path";
import autoload from "@fastify/autoload";
import Fastify, { FastifyInstance } from "fastify";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { DECIMAL_RADIX } from "@/lib/constants/number.constant.js";
import { DEFAULT_TRUST_PROXY_HOPS } from "@/lib/constants/server.constant.js";
import { ENV_TO_LOGGER, GCP_LOGGER } from "@/lib/constants/logger.constant.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const parsedHops = Number.parseInt(
    process.env.TRUST_PROXY_HOPS ?? String(DEFAULT_TRUST_PROXY_HOPS),
    DECIMAL_RADIX
);

const trustProxyHops = Number.isNaN(parsedHops)
    ? DEFAULT_TRUST_PROXY_HOPS
    : parsedHops;

/**
 * Trusts the nearest `TRUST_PROXY_HOPS` X-Forwarded-For hops for `request.ip`.
 * Deployed value: 2 (Google Front End + the Vercel rewrite), so `request.ip` is
 * the client address the Vercel edge appended. Fastify >= 5.12 makes a numeric
 * `trustProxy` fail closed, so the hop count is expressed as a function.
 *
 * Threat model at 2 hops: Cloud Run's `*.run.app` URL is also public, and a
 * caller hitting it directly controls the entry left of the one GFE appends,
 * so it can rotate the IP-keyed buckets (sign-up, sign-in, places, hotels).
 * Mitigations: sign-in also has a per-email limit, authenticated routes key by
 * user id, AI cost has a global daily ceiling, and the LiteAPI client throttles
 * search calls in-process so the shared LiteAPI key keeps headroom for
 * prebook and book. Direct access to Cloud Run itself remains a known residual
 * risk (fix: a shared secret header from Vercel checked in `onRequest`).
 */
const trustProxy = (_address: string, hop: number): boolean =>
    hop < trustProxyHops;

export const configureServer = async (): Promise<FastifyInstance> => {
    const fastify = Fastify({
        logger: {
            ...(ENV_TO_LOGGER[
                process.env.NODE_ENV as "development" | "production" | "test"
            ] ?? GCP_LOGGER),
            redact: {
                paths: [
                    "req.headers.cookie",
                    "*.email",
                    "email",
                    "*.phone",
                    "phone",
                ],
                censor: "[REDACTED]",
            },
        },
        trustProxy,
    });

    try {
        await fastify.register(autoload, {
            dir: path.join(__dirname, "plugins"),
            forceESM: true,
        });

        await fastify.register(autoload, {
            dir: path.join(__dirname, "modules"),
            dirNameRoutePrefix: false,
            forceESM: true,

            maxDepth: 1,
            matchFilter: /\/index\.(ts|js)$/,
        });

        fastify.addHook("onClose", async () => {
            // Close all active connections here or directly inside the plugin.
        });

        await fastify.ready();
    } catch (err) {
        fastify.log.fatal(err, "failed to configure server");

        process.exit(1);
    }

    return fastify;
};
