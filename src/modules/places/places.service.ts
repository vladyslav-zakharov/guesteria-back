import { MAX_PLACES } from "./places.constant.js";
import { addDIResolverName } from "@/lib/awilix/awilix.js";
import { toPlaceDto } from "@/lib/liteapi/liteapi.mapper.js";
import { LiteApiClient } from "@/lib/liteapi/liteapi.type.js";
import {
    PlacesQuery,
    PlacesResponse,
} from "@/lib/validation/places/places.schema.js";

export type SearchPlacesPayload = {
    query: PlacesQuery;
};

export type PlacesService = {
    searchPlaces: (payload: SearchPlacesPayload) => Promise<PlacesResponse>;
};

export const createService = (liteApiClient: LiteApiClient): PlacesService => ({
    searchPlaces: async ({ query }) => {
        const places = await liteApiClient.searchPlaces(query.q);

        return { places: places.slice(0, MAX_PLACES).map(toPlaceDto) };
    },
});

addDIResolverName(createService, "placesService");
