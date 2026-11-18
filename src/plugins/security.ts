import fp from "fastify-plugin";
import fastifyHelmet from "@fastify/helmet";
import { FastifyInstance } from "fastify";
import { FastifyPlugin } from "@/lib/constants/fastify.constant.js";

const configureSecurity = async (fastify: FastifyInstance) => {
    // JSON API: the front (Vercel) owns the page CSP; a CSP here only breaks Swagger UI.
    await fastify.register(fastifyHelmet, { contentSecurityPolicy: false });

    fastify.addHook("onSend", async (_request, reply, payload) => {
        reply.header("Cache-Control", "no-store");

        return payload;
    });
};

export default fp(configureSecurity, { dependencies: [FastifyPlugin.Env] });
