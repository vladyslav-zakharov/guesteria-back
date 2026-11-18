import { z } from "zod";
import { getTodayStayDate } from "@/lib/dates/dates.js";
import { STAY_LIMITS, refineStay } from "@/lib/validation/stay/stay.schema.js";
import {
    hotelParamsSchema,
    moneySchema,
} from "@/lib/validation/hotels/hotels.schema.js";

const OFFER_ID_MAX_LENGTH = 2000;
const NAME_MIN_LENGTH = 1;
const NAME_MAX_LENGTH = 50;
const EMAIL_MAX_LENGTH = 254;
const PHONE_PATTERN = /^\+?[0-9 ()-]{7,20}$/;
const SPECIAL_REQUESTS_MAX_LENGTH = 500;
const BOOKING_STATUSES = ["CONFIRMED", "CANCELLED"] as const;

/**
 * JSON body: `adults` is an integer and `children` an array of integer ages
 * (no string coercion). The cross-field stay rules are the same `refineStay`
 * as the hotel search query. `today` is injectable for tests.
 */
const buildPrebookBodySchema = ({ today }: { today: () => string }) =>
    z
        .object({
            hotelId: hotelParamsSchema.shape.hotelId,
            offerId: z.string().min(1).max(OFFER_ID_MAX_LENGTH),
            checkin: z.iso.date(),
            checkout: z.iso.date(),
            adults: z
                .number()
                .int()
                .min(STAY_LIMITS.minAdults)
                .max(STAY_LIMITS.maxAdults),
            children: z
                .array(z.number().int().min(0).max(STAY_LIMITS.maxChildAge))
                .max(STAY_LIMITS.maxChildren),
        })
        .superRefine(refineStay({ today }));

const prebookBodySchema = buildPrebookBodySchema({ today: getTodayStayDate });

type PrebookInput = z.infer<typeof prebookBodySchema>;

const guestSchema = z.object({
    firstName: z.string().trim().min(NAME_MIN_LENGTH).max(NAME_MAX_LENGTH),
    lastName: z.string().trim().min(NAME_MIN_LENGTH).max(NAME_MAX_LENGTH),
    email: z.string().trim().pipe(z.email().max(EMAIL_MAX_LENGTH)),
    phone: z.string().trim().regex(PHONE_PATTERN),
});

type GuestInput = z.infer<typeof guestSchema>;

const bookBodySchema = z.object({
    prebookId: z.uuid(),
    guest: guestSchema,
    specialRequests: z
        .string()
        .trim()
        .max(SPECIAL_REQUESTS_MAX_LENGTH)
        .optional()
        .transform((value) => value || null),
});

type BookInput = z.infer<typeof bookBodySchema>;

const bookingParamsSchema = z.object({
    bookingId: z.uuid(),
});

type BookingParams = z.infer<typeof bookingParamsSchema>;

const prebookDtoSchema = z.object({
    id: z.uuid(),
    hotelName: z.string(),
    roomName: z.string(),
    boardName: z.string(),
    checkin: z.iso.date(),
    checkout: z.iso.date(),
    nights: z.number().int(),
    price: moneySchema,
    priceChanged: z.boolean(),
    refundable: z.boolean(),
    cancellationDeadline: z.iso.datetime().nullable(),
});

type PrebookDto = z.infer<typeof prebookDtoSchema>;

const bookingDtoSchema = z.object({
    id: z.uuid(),
    status: z.enum(BOOKING_STATUSES),
    hotel: z.object({
        hotelId: z.string(),
        name: z.string(),
        photoUrl: z.url().nullable(),
        address: z.string(),
    }),
    roomName: z.string(),
    boardName: z.string(),
    checkin: z.iso.date(),
    checkout: z.iso.date(),
    nights: z.number().int(),
    adults: z.number().int(),
    childrenAges: z.array(z.number().int()),
    price: moneySchema,
    refundable: z.boolean(),
    cancellationDeadline: z.iso.datetime().nullable(),
    guest: z.object({
        firstName: z.string(),
        lastName: z.string(),
        email: z.string(),
        phone: z.string(),
    }),
    specialRequests: z.string().nullable(),
    createdAt: z.iso.datetime(),
});

type BookingDto = z.infer<typeof bookingDtoSchema>;

const prebookResponseSchema = z.object({
    prebook: prebookDtoSchema,
});

type PrebookResponse = z.infer<typeof prebookResponseSchema>;

const bookingResponseSchema = z.object({
    booking: bookingDtoSchema,
});

type BookingResponse = z.infer<typeof bookingResponseSchema>;

const bookingsResponseSchema = z.object({
    bookings: z.array(bookingDtoSchema),
});

type BookingsResponse = z.infer<typeof bookingsResponseSchema>;

export {
    buildPrebookBodySchema,
    prebookBodySchema,
    guestSchema,
    bookBodySchema,
    bookingParamsSchema,
    prebookDtoSchema,
    bookingDtoSchema,
    prebookResponseSchema,
    bookingResponseSchema,
    bookingsResponseSchema,
};

export type {
    PrebookInput,
    GuestInput,
    BookInput,
    BookingParams,
    PrebookDto,
    BookingDto,
    PrebookResponse,
    BookingResponse,
    BookingsResponse,
};
