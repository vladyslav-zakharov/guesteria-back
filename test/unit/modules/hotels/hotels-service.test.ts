import fs from "node:fs";
import path from "node:path";
import { FastifyBaseLogger } from "fastify";
import { mock } from "vitest-mock-extended";
import { NotFoundError } from "@/lib/errors/errors.js";
import { LiteApiClient } from "@/lib/liteapi/liteapi.type.js";
import { createService } from "@/modules/hotels/hotels.service.js";
import * as mapper from "@/lib/liteapi/liteapi.mapper.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    liteHotelDetailsResponseSchema,
    liteHotelsResponseSchema,
    liteRatesResponseSchema,
} from "@/lib/validation/liteapi/liteapi.schema.js";

vi.mock("@/lib/liteapi/liteapi.mapper.js", async (importOriginal) => {
    const actual =
        await importOriginal<
            typeof import("@/lib/liteapi/liteapi.mapper.js")
        >();

    return { ...actual, toHotelCards: vi.fn(actual.toHotelCards) };
});

const fixture = (name: string): unknown =>
    JSON.parse(
        fs.readFileSync(
            path.join(process.cwd(), "test/fixtures/liteapi", `${name}.json`),
            "utf-8"
        )
    );

const hotels = liteHotelsResponseSchema.parse(
    fixture("data-hotels-barcelona")
).data;
const rates = liteRatesResponseSchema.parse(fixture("rates-barcelona")).data;
const hotelDetails = liteHotelDetailsResponseSchema.parse(
    fixture("data-hotel")
).data;

const query = {
    placeId: "ChIJ5TCOcRaYpBIRCmZHTz37sEQ",
    checkin: "2026-12-18",
    checkout: "2026-12-20",
    adults: 2,
    children: [5],
    sort: "price" as const,
    refundableOnly: false,
};

const setup = () => {
    const client = mock<LiteApiClient>();
    const log = mock<FastifyBaseLogger>();

    return { client, log, service: createService(client, log) };
};

describe("hotelsService.searchHotels", () => {
    beforeEach(() => {
        vi.mocked(mapper.toHotelCards).mockClear();
    });

    it("returns an empty list and nights when no hotel has rates", async () => {
        const { client, service } = setup();

        client.getHotelsByPlace.mockResolvedValueOnce(hotels);
        client.getRates.mockResolvedValueOnce([]);

        await expect(service.searchHotels({ query })).resolves.toEqual({
            hotels: [],
            nights: 2,
        });
    });

    it("does not call rates for a place without hotels", async () => {
        const { client, service } = setup();

        client.getHotelsByPlace.mockResolvedValueOnce([]);

        await expect(service.searchHotels({ query })).resolves.toEqual({
            hotels: [],
            nights: 2,
        });
        expect(client.getRates).not.toHaveBeenCalled();
    });

    it("makes one rates call with at most 50 hotel ids and the occupancy", async () => {
        const { client, service } = setup();
        const many = Array.from({ length: 60 }, (_unused, index) => ({
            ...hotels[0],
            id: `hotel-${index}`,
        }));

        client.getHotelsByPlace.mockResolvedValueOnce(many);
        client.getRates.mockResolvedValueOnce([]);

        await service.searchHotels({ query });

        expect(client.getRates).toHaveBeenCalledTimes(1);

        const [input] = client.getRates.mock.calls[0];

        expect(input.hotelIds).toHaveLength(50);
        expect(input).toMatchObject({
            checkin: "2026-12-18",
            checkout: "2026-12-20",
            occupancy: { adults: 2, children: [5] },
            maxRatesPerHotel: 3,
        });
    });

    it("passes sort=rating and refundableOnly through to toHotelCards", async () => {
        const { client, service } = setup();

        client.getHotelsByPlace.mockResolvedValueOnce(hotels);
        client.getRates.mockResolvedValueOnce(rates);

        const result = await service.searchHotels({
            query: { ...query, sort: "rating", refundableOnly: true },
        });

        expect(mapper.toHotelCards).toHaveBeenCalledWith(
            expect.objectContaining({
                sort: "rating",
                refundableOnly: true,
                limit: 30,
            })
        );
        expect(result.hotels.length).toBeGreaterThan(0);
        expect(result.hotels.length).toBeLessThanOrEqual(30);
        expect(result.hotels.every((card) => card.refundable)).toBe(true);
    });
});

describe("hotelsService.getHotel", () => {
    const stay = {
        checkin: "2026-12-18",
        checkout: "2026-12-20",
        adults: 2,
        children: [],
    };

    it("returns details, offers and nights", async () => {
        const { client, service } = setup();
        const hotelRates = rates[0];

        client.getHotel.mockResolvedValueOnce(hotelDetails);
        client.getRates.mockResolvedValueOnce([
            { ...hotelRates, hotelId: hotelDetails.id },
        ]);

        const result = await service.getHotel({
            hotelId: hotelDetails.id,
            stay,
        });

        expect(result.hotel.hotelId).toBe(hotelDetails.id);
        expect(result.offers).toHaveLength(hotelRates.roomTypes.length);
        expect(result.nights).toBe(2);
        expect(client.getRates).toHaveBeenCalledWith(
            expect.objectContaining({ hotelIds: [hotelDetails.id] })
        );
    });

    it("asks for every rate and returns every offer, cheapest first (AC 3)", async () => {
        const { client, service } = setup();
        const [roomType] = rates[0].roomTypes;
        const amounts = [410, 120, 260, 95, 330];

        client.getHotel.mockResolvedValueOnce(hotelDetails);
        client.getRates.mockResolvedValueOnce([
            {
                hotelId: hotelDetails.id,
                roomTypes: amounts.map((amount, index) => ({
                    ...roomType,
                    offerId: `offer-${index}`,
                    offerRetailRate: { amount, currency: "EUR" },
                })),
            },
        ]);

        const result = await service.getHotel({
            hotelId: hotelDetails.id,
            stay,
        });

        const [input] = client.getRates.mock.calls[0];

        expect(input).not.toHaveProperty("maxRatesPerHotel");
        expect(result.offers.map((offer) => offer.price.amount)).toEqual([
            95, 120, 260, 330, 410,
        ]);
    });

    it("warns about refundable offers without a readable cancellation deadline", async () => {
        const { client, log, service } = setup();
        const [roomType] = rates[0].roomTypes;
        const [rate] = roomType.rates;

        client.getHotel.mockResolvedValueOnce(hotelDetails);
        client.getRates.mockResolvedValueOnce([
            {
                hotelId: hotelDetails.id,
                roomTypes: [
                    {
                        ...roomType,
                        rates: [
                            {
                                ...rate,
                                cancellationPolicies: {
                                    refundableTag: "RFN",
                                    cancelPolicyInfos: [],
                                },
                            },
                        ],
                    },
                ],
            },
        ]);

        const result = await service.getHotel({
            hotelId: hotelDetails.id,
            stay,
        });

        expect(result.offers[0]).toMatchObject({
            refundable: true,
            cancellationDeadline: null,
        });
        expect(log.warn).toHaveBeenCalledWith(
            { hotelId: hotelDetails.id, offers: 1 },
            expect.any(String)
        );
    });

    it("returns no offers when the hotel has no availability", async () => {
        const { client, service } = setup();

        client.getHotel.mockResolvedValueOnce(hotelDetails);
        client.getRates.mockResolvedValueOnce([]);

        const result = await service.getHotel({
            hotelId: hotelDetails.id,
            stay,
        });

        expect(result.offers).toEqual([]);
    });

    it("prefers the hotel's 404 over a rates failure", async () => {
        const { client, service } = setup();

        client.getHotel.mockRejectedValueOnce(new NotFoundError("missing"));
        client.getRates.mockRejectedValueOnce(new Error("rates failed"));

        await expect(
            service.getHotel({ hotelId: "unknown", stay })
        ).rejects.toMatchObject({ statusCode: 404 });
    });
});
