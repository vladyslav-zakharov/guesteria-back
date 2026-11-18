import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
    stripHtml,
    toHotelCards,
    toHotelDetails,
    toOffers,
    toPlaceDto,
    toPrebookSnapshot,
} from "@/lib/liteapi/liteapi.mapper.js";
import {
    LiteHotelSummary,
    liteHotelDetailsResponseSchema,
    liteHotelsResponseSchema,
    litePlacesResponseSchema,
    litePrebookResponseSchema,
    liteRatesResponseSchema,
} from "@/lib/validation/liteapi/liteapi.schema.js";

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
const prebook = litePrebookResponseSchema.parse(fixture("prebook")).data;

const isRefundable = (tag: string | null | undefined) => tag === "RFN";

const cheapestFor = ({
    hotelId,
    refundableOnly,
}: {
    hotelId: string;
    refundableOnly: boolean;
}) => {
    const amounts = (
        rates.find((entry) => entry.hotelId === hotelId)?.roomTypes ?? []
    )
        .filter(
            (roomType) =>
                !refundableOnly ||
                isRefundable(
                    roomType.rates[0].cancellationPolicies.refundableTag
                )
        )
        .map((roomType) => roomType.offerRetailRate.amount);

    return amounts.length > 0 ? Math.min(...amounts) : null;
};

const baseInput = {
    hotels,
    rates,
    sort: "price" as const,
    refundableOnly: false,
    limit: 30,
};

describe("stripHtml", () => {
    it("drops tags and scripts and decodes entities", () => {
        expect(
            stripHtml("<p>Sea&nbsp;view &amp; pool</p><br><script>x</script>")
        ).toBe("Sea view & pool");
    });

    it("keeps paragraphs apart and leaves unknown entities alone", () => {
        expect(
            stripHtml(
                "<p><strong>Title</strong></p><p>Body &#39;x&#39; &bogus; &#99999999;</p>"
            )
        ).toBe("Title\n\nBody 'x' &bogus; &#99999999;");
    });
});

describe("toPlaceDto", () => {
    it("maps displayName and formattedAddress", () => {
        const [place] = litePlacesResponseSchema.parse(
            fixture("places-barcelona")
        ).data;

        expect(toPlaceDto(place)).toEqual({
            placeId: place.placeId,
            name: place.displayName,
            address: place.formattedAddress,
        });
    });
});

describe("toOffers", () => {
    it("maps one offer per roomType with refundability and an ISO deadline", () => {
        const hotelRates = rates[1];
        const offers = toOffers(hotelRates);

        expect(offers).toHaveLength(hotelRates.roomTypes.length);

        hotelRates.roomTypes.forEach((roomType) => {
            const offer = offers.find(
                (candidate) => candidate.offerId === roomType.offerId
            );
            const [rate] = roomType.rates;
            const refundable = isRefundable(
                rate.cancellationPolicies.refundableTag
            );
            const firstPolicy =
                rate.cancellationPolicies.cancelPolicyInfos?.[0];

            expect(offer).toEqual({
                offerId: roomType.offerId,
                roomName: rate.name,
                boardName: rate.boardName,
                price: roomType.offerRetailRate,
                refundable,
                cancellationDeadline:
                    refundable && firstPolicy
                        ? `${firstPolicy.cancelTime.replace(" ", "T")}.000Z`
                        : null,
            });
        });
    });

    it("converts the GMT cancelTime to ISO-8601 UTC", () => {
        const offers = toOffers(rates[1]);
        const refundable = offers.find((offer) => offer.refundable);

        expect(refundable?.cancellationDeadline).toMatch(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/
        );
        expect(
            offers
                .filter((offer) => !offer.refundable)
                .every((offer) => offer.cancellationDeadline === null)
        ).toBe(true);
    });

    it("honours a non-GMT offset and rejects an unknown timezone", () => {
        const [hotelRates] = rates;
        const roomType = hotelRates.roomTypes[0];
        const withPolicy = (timezone: string) => ({
            ...hotelRates,
            roomTypes: [
                {
                    ...roomType,
                    rates: [
                        {
                            ...roomType.rates[0],
                            cancellationPolicies: {
                                refundableTag: "RFN",
                                cancelPolicyInfos: [
                                    {
                                        cancelTime: "2026-12-10 10:00:00",
                                        timezone,
                                    },
                                ],
                            },
                        },
                    ],
                },
            ],
        });

        expect(toOffers(withPolicy("GMT+02:00"))[0].cancellationDeadline).toBe(
            "2026-12-10T08:00:00.000Z"
        );
        expect(
            toOffers(withPolicy("Europe/Madrid"))[0].cancellationDeadline
        ).toBeNull();
    });

    it("parses cancelTime strictly as UTC wall time with dayjs", () => {
        const [hotelRates] = rates;
        const roomType = hotelRates.roomTypes[0];
        const deadline = ({
            cancelTime,
            timezone,
        }: {
            cancelTime: string;
            timezone: string;
        }) =>
            toOffers({
                ...hotelRates,
                roomTypes: [
                    {
                        ...roomType,
                        rates: [
                            {
                                ...roomType.rates[0],
                                cancellationPolicies: {
                                    refundableTag: "RFN",
                                    cancelPolicyInfos: [
                                        { cancelTime, timezone },
                                    ],
                                },
                            },
                        ],
                    },
                ],
            })[0].cancellationDeadline;

        expect(
            deadline({ cancelTime: "2026-12-10 23:30:00", timezone: "GMT" })
        ).toBe("2026-12-10T23:30:00.000Z");
        expect(
            deadline({ cancelTime: "2026-12-10T10:00", timezone: "UTC" })
        ).toBe("2026-12-10T10:00:00.000Z");
        expect(
            deadline({ cancelTime: "2026-12-10 10:00:00Z", timezone: "" })
        ).toBe("2026-12-10T10:00:00.000Z");
        expect(
            deadline({
                cancelTime: "2026-12-31 22:00:00",
                timezone: "GMT-05:00",
            })
        ).toBe("2027-01-01T03:00:00.000Z");
        expect(
            deadline({ cancelTime: "2026-02-30 10:00:00", timezone: "GMT" })
        ).toBeNull();
        expect(
            deadline({ cancelTime: "10/12/2026 10:00", timezone: "GMT" })
        ).toBeNull();
    });
});

describe("toHotelCards", () => {
    it("joins by hotelId, drops hotels without rates and takes the cheapest offer", () => {
        const withoutRates: LiteHotelSummary = {
            ...hotels[0],
            id: "no-rates-hotel",
        };
        const cards = toHotelCards({
            ...baseInput,
            hotels: [...hotels, withoutRates],
        });
        const ratedIds = new Set(rates.map((entry) => entry.hotelId));

        expect(cards.map((card) => card.hotelId).sort()).toEqual(
            hotels
                .filter((hotel) => ratedIds.has(hotel.id))
                .map((hotel) => hotel.id)
                .sort()
        );

        cards.forEach((card) => {
            expect(card.price.amount).toBe(
                cheapestFor({ hotelId: card.hotelId, refundableOnly: false })
            );
        });
    });

    it("sorts by price ascending", () => {
        const amounts = toHotelCards(baseInput).map(
            (card) => card.price.amount
        );

        expect(amounts).toEqual(
            [...amounts].sort((left, right) => left - right)
        );
    });

    it("sorts by rating descending with nulls last", () => {
        const unrated: LiteHotelSummary = { ...hotels[0], rating: null };
        const cards = toHotelCards({
            ...baseInput,
            hotels: [unrated, ...hotels.slice(1)],
            sort: "rating",
        });
        const ratings = cards.map((card) => card.rating);

        expect(ratings.at(-1)).toBeNull();

        const rated = ratings.filter(
            (rating): rating is number => rating !== null
        );

        expect(rated).toEqual([...rated].sort((left, right) => right - left));
    });

    it("applies refundableOnly and prices with the cheapest refundable offer", () => {
        const cards = toHotelCards({ ...baseInput, refundableOnly: true });
        const expectedIds = rates
            .filter((entry) =>
                entry.roomTypes.some((roomType) =>
                    isRefundable(
                        roomType.rates[0].cancellationPolicies.refundableTag
                    )
                )
            )
            .map((entry) => entry.hotelId)
            .sort();

        expect(cards.map((card) => card.hotelId).sort()).toEqual(expectedIds);

        cards.forEach((card) => {
            expect(card.refundable).toBe(true);
            expect(card.price.amount).toBe(
                cheapestFor({ hotelId: card.hotelId, refundableOnly: true })
            );
        });

        const changed = cards.find(
            (card) =>
                card.price.amount !==
                cheapestFor({ hotelId: card.hotelId, refundableOnly: false })
        );

        expect(changed).toBeDefined();
    });

    it("caps the result at limit", () => {
        expect(toHotelCards({ ...baseInput, limit: 1 })).toHaveLength(1);
    });

    it("maps stars 0 to null and drops non-https photos", () => {
        const [card] = toHotelCards({
            ...baseInput,
            hotels: [
                {
                    ...hotels[0],
                    stars: 0,
                    main_photo: "http://example.com/a.jpg",
                },
            ],
        });

        expect(card.stars).toBeNull();
        expect(card.photoUrl).toBeNull();
    });
});

describe("toHotelDetails", () => {
    it("drops non-https photos and returns a plain-text description", () => {
        const details = toHotelDetails({
            ...hotelDetails,
            hotelImages: [
                ...(hotelDetails.hotelImages ?? []),
                { url: "http://insecure.example.com/x.jpg", order: 0 },
                { url: "javascript:alert(1)", order: 0 },
            ],
        });
        const httpsCount = new Set(
            (hotelDetails.hotelImages ?? [])
                .map((image) => image.url)
                .filter((url) => url.startsWith("https://"))
        ).size;

        expect(details.photos).toHaveLength(httpsCount);
        expect(details.photos.every((url) => url.startsWith("https://"))).toBe(
            true
        );
        expect(details.description.length).toBeGreaterThan(0);
        expect(details.description).not.toMatch(/<[a-z/][^>]*>/i);
    });

    it("maps starRating, country and policy times", () => {
        const details = toHotelDetails(hotelDetails);

        expect(details).toMatchObject({
            hotelId: hotelDetails.id,
            name: hotelDetails.name,
            stars: hotelDetails.starRating,
            country: hotelDetails.country,
            checkinTime: hotelDetails.policyAttributes?.checkIn?.from,
            checkoutTime: hotelDetails.policyAttributes?.checkOut?.until,
            facilities: hotelDetails.hotelFacilities,
        });
    });
});

describe("toPrebookSnapshot", () => {
    it("maps price, terms and priceChanged", () => {
        const [rate] = prebook.roomTypes[0].rates;

        expect(toPrebookSnapshot(prebook)).toEqual({
            roomName: rate.name,
            boardName: rate.boardName,
            price: { amount: prebook.price, currency: prebook.currency },
            refundable: isRefundable(rate.cancellationPolicies.refundableTag),
            cancellationDeadline: "2026-12-10T10:00:00.000Z",
            priceChanged: prebook.priceDifferencePercent !== 0,
        });
        expect(
            toPrebookSnapshot({ ...prebook, priceDifferencePercent: 1.5 })
                .priceChanged
        ).toBe(true);
    });
});
