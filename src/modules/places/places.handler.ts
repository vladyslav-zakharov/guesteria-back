import { PlacesService } from "./places.service.js";
import { FastifyReply, FastifyRequest } from "fastify";
import { addDIResolverName } from "@/lib/awilix/awilix.js";
import { PlacesQuery } from "@/lib/validation/places/places.schema.js";

export type PlacesHandler = {
    searchPlaces: (
        request: FastifyRequest<{ Querystring: PlacesQuery }>,
        reply: FastifyReply
    ) => Promise<void>;
};

export const createHandler = (placesService: PlacesService): PlacesHandler => {
    return {
        searchPlaces: async (request, reply) => {
            const result = await placesService.searchPlaces({
                query: request.query,
            });

            return reply.send(result);
        },
    };
};

addDIResolverName(createHandler, "placesHandler");
