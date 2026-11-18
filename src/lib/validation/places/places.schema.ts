import { z } from "zod";

const PLACES_QUERY_MIN_LENGTH = 2;
const PLACES_QUERY_MAX_LENGTH = 100;

const placesQuerySchema = z.object({
    q: z
        .string()
        .trim()
        .min(PLACES_QUERY_MIN_LENGTH)
        .max(PLACES_QUERY_MAX_LENGTH),
});

type PlacesQuery = z.infer<typeof placesQuerySchema>;

const placeSchema = z.object({
    placeId: z.string(),
    name: z.string(),
    address: z.string(),
});

type PlaceDto = z.infer<typeof placeSchema>;

const placesResponseSchema = z.object({
    places: z.array(placeSchema),
});

type PlacesResponse = z.infer<typeof placesResponseSchema>;

export { placesQuerySchema, placeSchema, placesResponseSchema };

export type { PlacesQuery, PlaceDto, PlacesResponse };
