import { FastifyInstance } from "fastify";
import { HotelsHandler } from "./hotels.handler.js";
import {
    HOTELS_RATE_LIMIT_MAX,
    HOTELS_RATE_LIMIT_TIME_WINDOW,
} from "./hotels.constant.js";
import {
    hotelParamsSchema,
    hotelQuerySchema,
    hotelResponseSchema,
    hotelsQuerySchema,
    hotelsResponseSchema,
} from "@/lib/validation/hotels/hotels.schema.js";

const HOTELS_TAG = "hotels";

enum HotelsRoute {
    Root = "/",
    Hotel = "/:hotelId",
}

const hotelsRateLimit = {
    rateLimit: {
        max: HOTELS_RATE_LIMIT_MAX,
        timeWindow: HOTELS_RATE_LIMIT_TIME_WINDOW,
    },
};

export const createHotelsRoutes = (
    fastify: FastifyInstance,
    hotelsHandler: HotelsHandler
) => {
    fastify.get(
        HotelsRoute.Root,
        {
            config: hotelsRateLimit,
            schema: {
                tags: [HOTELS_TAG],
                summary: "Search hotels with rates in a place (up to 30)",
                querystring: hotelsQuerySchema,
                response: {
                    200: hotelsResponseSchema,
                },
            },
        },
        hotelsHandler.searchHotels
    );

    fastify.get(
        HotelsRoute.Hotel,
        {
            config: hotelsRateLimit,
            schema: {
                tags: [HOTELS_TAG],
                summary: "Get hotel details and offers for a stay",
                params: hotelParamsSchema,
                querystring: hotelQuerySchema,
                response: {
                    200: hotelResponseSchema,
                },
            },
        },
        hotelsHandler.getHotel
    );
};
