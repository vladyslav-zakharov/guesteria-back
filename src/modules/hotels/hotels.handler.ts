import { HotelsService } from "./hotels.service.js";
import { FastifyReply, FastifyRequest } from "fastify";
import { addDIResolverName } from "@/lib/awilix/awilix.js";
import {
    HotelParams,
    HotelQuery,
    HotelsQuery,
} from "@/lib/validation/hotels/hotels.schema.js";

export type HotelsHandler = {
    searchHotels: (
        request: FastifyRequest<{ Querystring: HotelsQuery }>,
        reply: FastifyReply
    ) => Promise<void>;
    getHotel: (
        request: FastifyRequest<{
            Params: HotelParams;
            Querystring: HotelQuery;
        }>,
        reply: FastifyReply
    ) => Promise<void>;
};

export const createHandler = (hotelsService: HotelsService): HotelsHandler => {
    return {
        searchHotels: async (request, reply) => {
            const result = await hotelsService.searchHotels({
                query: request.query,
            });

            return reply.send(result);
        },

        getHotel: async (request, reply) => {
            const result = await hotelsService.getHotel({
                hotelId: request.params.hotelId,
                stay: request.query,
            });

            return reply.send(result);
        },
    };
};

addDIResolverName(createHandler, "hotelsHandler");
