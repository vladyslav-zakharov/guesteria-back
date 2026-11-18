import { AwilixContainer } from "awilix";
import { FastifyRequest } from "fastify";
import { EnvConfig } from "./env.type.js";
import { PrismaClient } from "@prisma/client";
import { Cradle } from "./di-container.type.js";
import { AuthUser } from "@/lib/validation/auth/auth.schema.js";

declare module "fastify" {
    export interface FastifyInstance {
        config: EnvConfig;
        prisma: PrismaClient;
        di: AwilixContainer<Cradle>;
        authorization: (request: FastifyRequest) => Promise<void>;
    }
}

declare module "@fastify/jwt" {
    interface FastifyJWT {
        payload: { sub: string };
        user: AuthUser;
    }
}
