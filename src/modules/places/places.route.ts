import { FastifyInstance } from "fastify";
import { PlacesHandler } from "./places.handler.js";
import {
    PLACES_RATE_LIMIT_MAX,
    PLACES_RATE_LIMIT_TIME_WINDOW,
} from "./places.constant.js";
import {
    placesQuerySchema,
    placesResponseSchema,
} from "@/lib/validation/places/places.schema.js";

const PLACES_TAG = "places";

enum PlacesRoute {
    Root = "/",
}

export const createPlacesRoutes = (
    fastify: FastifyInstance,
    placesHandler: PlacesHandler
) => {
    fastify.get(
        PlacesRoute.Root,
        {
            config: {
                rateLimit: {
                    max: PLACES_RATE_LIMIT_MAX,
                    timeWindow: PLACES_RATE_LIMIT_TIME_WINDOW,
                },
            },
            schema: {
                tags: [PLACES_TAG],
                summary: "Search destinations by text (up to 8)",
                querystring: placesQuerySchema,
                response: {
                    200: placesResponseSchema,
                },
            },
        },
        placesHandler.searchPlaces
    );
};
