import { z } from "zod";
import { stayQuerySchema } from "@/lib/validation/stay/stay.schema.js";

const PLACE_ID_MAX_LENGTH = 200;
const HOTEL_ID_MAX_LENGTH = 64;
const HOTEL_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const HOTEL_SORTS = ["price", "rating"] as const;
const BOOLEAN_STRINGS = ["true", "false"] as const;

const hotelsQuerySchema = stayQuerySchema.safeExtend({
    placeId: z.string().trim().min(1).max(PLACE_ID_MAX_LENGTH),
    sort: z.enum(HOTEL_SORTS).default("price"),
    refundableOnly: z
        .enum(BOOLEAN_STRINGS)
        .default("false")
        .transform((value) => value === "true"),
});

type HotelsQuery = z.infer<typeof hotelsQuerySchema>;

const hotelParamsSchema = z.object({
    hotelId: z.string().min(1).max(HOTEL_ID_MAX_LENGTH).regex(HOTEL_ID_PATTERN),
});

type HotelParams = z.infer<typeof hotelParamsSchema>;

const hotelQuerySchema = stayQuerySchema;

type HotelQuery = z.infer<typeof hotelQuerySchema>;

const moneySchema = z.object({
    amount: z.number(),
    currency: z.string(),
});

type Money = z.infer<typeof moneySchema>;

const offerSchema = z.object({
    offerId: z.string(),
    roomName: z.string(),
    boardName: z.string(),
    price: moneySchema,
    refundable: z.boolean(),
    cancellationDeadline: z.iso.datetime().nullable(),
});

type OfferDto = z.infer<typeof offerSchema>;

const hotelCardSchema = z.object({
    hotelId: z.string(),
    name: z.string(),
    photoUrl: z.url().nullable(),
    stars: z.number().nullable(),
    rating: z.number().nullable(),
    reviewCount: z.number().int().nullable(),
    address: z.string(),
    price: moneySchema,
    refundable: z.boolean(),
});

type HotelCardDto = z.infer<typeof hotelCardSchema>;

const hotelDetailsSchema = z.object({
    hotelId: z.string(),
    name: z.string(),
    address: z.string(),
    city: z.string(),
    country: z.string(),
    stars: z.number().nullable(),
    rating: z.number().nullable(),
    reviewCount: z.number().int().nullable(),
    description: z.string(),
    photos: z.array(z.url()),
    facilities: z.array(z.string()),
    checkinTime: z.string().nullable(),
    checkoutTime: z.string().nullable(),
});

type HotelDetailsDto = z.infer<typeof hotelDetailsSchema>;

const hotelsResponseSchema = z.object({
    hotels: z.array(hotelCardSchema),
    nights: z.number().int(),
});

type HotelsResponse = z.infer<typeof hotelsResponseSchema>;

const hotelResponseSchema = z.object({
    hotel: hotelDetailsSchema,
    offers: z.array(offerSchema),
    nights: z.number().int(),
});

type HotelResponse = z.infer<typeof hotelResponseSchema>;

export {
    hotelsQuerySchema,
    hotelParamsSchema,
    hotelQuerySchema,
    moneySchema,
    offerSchema,
    hotelCardSchema,
    hotelDetailsSchema,
    hotelsResponseSchema,
    hotelResponseSchema,
};

export type {
    HotelsQuery,
    HotelParams,
    HotelQuery,
    Money,
    OfferDto,
    HotelCardDto,
    HotelDetailsDto,
    HotelsResponse,
    HotelResponse,
};
