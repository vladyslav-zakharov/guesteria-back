import { z } from "zod";
import { GuestInput } from "@/lib/validation/bookings/bookings.schema.js";
import {
    HotelsQuery,
    Money as MoneyDto,
} from "@/lib/validation/hotels/hotels.schema.js";
import {
    LiteBooking,
    LiteHotelDetails,
    LiteHotelRates,
    LiteHotelSummary,
    LitePlace,
    LitePrebook,
} from "@/lib/validation/liteapi/liteapi.schema.js";

export type Money = MoneyDto;

export type Occupancy = { adults: number; children: number[] };

/**
 * `maxRatesPerHotel` caps the rates per hotel for the search results; the
 * hotel page leaves it out to get every available offer.
 */
export type RatesInput = {
    hotelIds: string[];
    checkin: string;
    checkout: string;
    occupancy: Occupancy;
    maxRatesPerHotel?: number;
};

export type BookInput = {
    prebookId: string;
    clientReference: string;
    guest: GuestInput;
};

export type CancelTimeInput = {
    cancelTime: string;
    timezone?: string | null;
};

export type PrebookSnapshot = {
    roomName: string;
    boardName: string;
    price: Money;
    refundable: boolean;
    cancellationDeadline: string | null;
    priceChanged: boolean;
};

export type HotelCardSort = HotelsQuery["sort"];

export type HotelCardsInput = {
    hotels: LiteHotelSummary[];
    rates: LiteHotelRates[];
    sort: HotelCardSort;
    refundableOnly: boolean;
    limit: number;
};

export type LiteApiErrorInput = { httpStatus: number; code: number | null };

/**
 * Requests share the search budget unless `bypassThrottle` is set (prebook
 * and book only).
 */
export type LiteRequest<T> = {
    url: URL;
    init?: { method: "GET" | "POST"; body?: string };
    schema: z.ZodType<T>;
    timeoutMs: number;
    bypassThrottle?: boolean;
};

export type LiteResponse = {
    ok: boolean;
    httpStatus: number;
    body: unknown;
    upstreamCode: number | null;
};

export type LiteApiClient = {
    searchPlaces: (query: string) => Promise<LitePlace[]>;
    getHotelsByPlace: (placeId: string) => Promise<LiteHotelSummary[]>;
    getRates: (input: RatesInput) => Promise<LiteHotelRates[]>;
    getHotel: (hotelId: string) => Promise<LiteHotelDetails>;
    prebook: (offerId: string) => Promise<LitePrebook>;
    book: (input: BookInput) => Promise<LiteBooking>;
};
