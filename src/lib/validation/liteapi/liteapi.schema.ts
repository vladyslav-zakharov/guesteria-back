import { z } from "zod";

/**
 * LiteAPI response schemas. They parse only the fields the mappers read, so a
 * missing required field fails loudly (API drift) while extra fields are ignored.
 * Field names come from the recorded sandbox fixtures in test/fixtures/liteapi.
 */

const liteMoneySchema = z.object({
    amount: z.number(),
    currency: z.string(),
});

const liteErrorEnvelopeSchema = z.object({
    error: z.object({
        code: z.number(),
    }),
});

const litePlaceSchema = z.object({
    placeId: z.string(),
    displayName: z.string(),
    formattedAddress: z.string().nullable().optional(),
});

type LitePlace = z.infer<typeof litePlaceSchema>;

const litePlacesResponseSchema = z.object({
    data: z.array(litePlaceSchema),
});

const liteHotelSummarySchema = z.object({
    id: z.string(),
    name: z.string(),
    main_photo: z.string().nullable().optional(),
    stars: z.number().nullable().optional(),
    rating: z.number().nullable().optional(),
    reviewCount: z.number().nullable().optional(),
    address: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
});

type LiteHotelSummary = z.infer<typeof liteHotelSummarySchema>;

const liteHotelsResponseSchema = z.object({
    data: z.array(liteHotelSummarySchema),
});

const liteCancelPolicyInfoSchema = z.object({
    cancelTime: z.string(),
    timezone: z.string().nullable().optional(),
});

const liteCancellationPoliciesSchema = z.object({
    cancelPolicyInfos: z
        .array(liteCancelPolicyInfoSchema)
        .nullable()
        .optional(),
    refundableTag: z.string().nullable().optional(),
});

const liteRateSchema = z.object({
    name: z.string(),
    boardName: z.string(),
    cancellationPolicies: liteCancellationPoliciesSchema,
});

type LiteRate = z.infer<typeof liteRateSchema>;

const liteRoomTypeSchema = z.object({
    offerId: z.string(),
    offerRetailRate: liteMoneySchema,
    rates: z.array(liteRateSchema).min(1),
});

const liteHotelRatesSchema = z.object({
    hotelId: z.string(),
    roomTypes: z.array(liteRoomTypeSchema),
});

type LiteHotelRates = z.infer<typeof liteHotelRatesSchema>;

const liteRatesResponseSchema = z.object({
    data: z.array(liteHotelRatesSchema),
});

const liteHotelImageSchema = z.object({
    url: z.string(),
    order: z.number().nullable().optional(),
});

const liteHotelDetailsSchema = z.object({
    id: z.string(),
    name: z.string(),
    hotelDescription: z.string().nullable().optional(),
    hotelImages: z.array(liteHotelImageSchema).nullable().optional(),
    main_photo: z.string().nullable().optional(),
    hotelFacilities: z.array(z.string()).nullable().optional(),
    checkinCheckoutTimes: z
        .object({
            checkin_start: z.string().nullable().optional(),
            checkout: z.string().nullable().optional(),
        })
        .nullable()
        .optional(),
    policyAttributes: z
        .object({
            checkIn: z
                .object({ from: z.string().nullable().optional() })
                .nullable()
                .optional(),
            checkOut: z
                .object({ until: z.string().nullable().optional() })
                .nullable()
                .optional(),
        })
        .nullable()
        .optional(),
    starRating: z.number().nullable().optional(),
    rating: z.number().nullable().optional(),
    reviewCount: z.number().nullable().optional(),
    address: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
});

type LiteHotelDetails = z.infer<typeof liteHotelDetailsSchema>;

const liteHotelDetailsResponseSchema = z.object({
    data: liteHotelDetailsSchema,
});

/**
 * One rate per booked room. A prebook rate also carries the occupancy LiteAPI
 * actually priced, which is stored instead of the client's request.
 */
const litePrebookRateSchema = liteRateSchema.extend({
    adultCount: z.number().int(),
    childrenAges: z.array(z.number().int()).nullable().optional(),
});

const litePrebookSchema = z.object({
    prebookId: z.string(),
    offerId: z.string(),
    hotelId: z.string(),
    price: z.number(),
    currency: z.string(),
    priceDifferencePercent: z.number(),
    checkin: z.string(),
    checkout: z.string(),
    roomTypes: z
        .array(z.object({ rates: z.array(litePrebookRateSchema).min(1) }))
        .min(1),
});

type LitePrebook = z.infer<typeof litePrebookSchema>;

const litePrebookResponseSchema = z.object({
    data: litePrebookSchema,
});

/**
 * Only `bookingId` and `status` are read; a booking LiteAPI confirmed must not
 * be lost because an unused field changed shape.
 */
const liteBookingSchema = z.object({
    bookingId: z.string(),
    status: z.string(),
});

type LiteBooking = z.infer<typeof liteBookingSchema>;

const liteBookingResponseSchema = z.object({
    data: liteBookingSchema,
});

/**
 * Best-effort read of the booking id from a book response whose full shape
 * did not parse, for the reconciliation log.
 */
const liteBookingIdProbeSchema = z.object({
    data: z.object({ bookingId: z.string() }),
});

export {
    liteErrorEnvelopeSchema,
    litePlacesResponseSchema,
    liteHotelsResponseSchema,
    liteRatesResponseSchema,
    liteHotelDetailsResponseSchema,
    litePrebookResponseSchema,
    liteBookingResponseSchema,
    liteBookingIdProbeSchema,
};

export type {
    LitePlace,
    LiteHotelSummary,
    LiteRate,
    LiteHotelRates,
    LiteHotelDetails,
    LitePrebook,
    LiteBooking,
};
