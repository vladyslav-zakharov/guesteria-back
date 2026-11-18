import { FastifyBaseLogger } from "fastify";
import { countNights } from "@/lib/dates/dates.js";
import { addDIResolverName } from "@/lib/awilix/awilix.js";
import { LiteApiClient } from "@/lib/liteapi/liteapi.type.js";
import { StayQuery } from "@/lib/validation/stay/stay.schema.js";
import { HOTELS_BY_PLACE_LIMIT } from "@/lib/liteapi/liteapi.constant.js";
import { MAX_HOTEL_CARDS, MAX_RATES_PER_HOTEL } from "./hotels.constant.js";
import {
    toHotelCards,
    toHotelDetails,
    toOffers,
} from "@/lib/liteapi/liteapi.mapper.js";
import {
    HotelResponse,
    HotelsQuery,
    HotelsResponse,
} from "@/lib/validation/hotels/hotels.schema.js";

export type SearchHotelsPayload = {
    query: HotelsQuery;
};

export type GetHotelPayload = {
    hotelId: string;
    stay: StayQuery;
};

export type HotelsService = {
    searchHotels: (payload: SearchHotelsPayload) => Promise<HotelsResponse>;
    getHotel: (payload: GetHotelPayload) => Promise<HotelResponse>;
};

export const createService = (
    liteApiClient: LiteApiClient,
    log: FastifyBaseLogger
): HotelsService => ({
    /**
     * One hotel list call (cached) and at most one rates call per search.
     * A place without hotels never reaches the rates endpoint.
     */
    searchHotels: async ({ query }) => {
        const { placeId, checkin, checkout, adults, children } = query;
        const nights = countNights({ checkin, checkout });

        const hotels = (await liteApiClient.getHotelsByPlace(placeId)).slice(
            0,
            HOTELS_BY_PLACE_LIMIT
        );

        if (hotels.length === 0) {
            return { hotels: [], nights };
        }

        const rates = await liteApiClient.getRates({
            hotelIds: hotels.map((hotel) => hotel.id),
            checkin,
            checkout,
            occupancy: { adults, children },
            maxRatesPerHotel: MAX_RATES_PER_HOTEL,
        });

        return {
            hotels: toHotelCards({
                hotels,
                rates,
                sort: query.sort,
                refundableOnly: query.refundableOnly,
                limit: MAX_HOTEL_CARDS,
            }),
            nights,
        };
    },

    /**
     * Hotel data and rates are fetched in parallel. The rates call has no
     * per-hotel cap, so every available offer is shown (AC 3). A hotel failure (404 for
     * an unknown id) wins over a rates failure, so the client sees the more
     * meaningful error.
     */
    getHotel: async ({ hotelId, stay }) => {
        const { checkin, checkout, adults, children } = stay;

        const [hotel, rates] = await Promise.allSettled([
            liteApiClient.getHotel(hotelId),
            liteApiClient.getRates({
                hotelIds: [hotelId],
                checkin,
                checkout,
                occupancy: { adults, children },
            }),
        ]);

        if (hotel.status === "rejected") {
            throw hotel.reason;
        }

        if (rates.status === "rejected") {
            throw rates.reason;
        }

        const hotelRates = rates.value.find(
            (entry) => entry.hotelId === hotelId
        );

        const offers = hotelRates ? toOffers(hotelRates) : [];

        const unreadableDeadlines = offers.filter(
            (offer) => offer.refundable && offer.cancellationDeadline === null
        ).length;

        if (unreadableDeadlines > 0) {
            log.warn(
                { hotelId, offers: unreadableDeadlines },
                "Refundable offers without a readable cancellation deadline"
            );
        }

        return {
            hotel: toHotelDetails(hotel.value),
            offers,
            nights: countNights({ checkin, checkout }),
        };
    },
});

addDIResolverName(createService, "hotelsService");
