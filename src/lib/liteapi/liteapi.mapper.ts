import { dayjs } from "@/lib/dates/dayjs.js";
import { DECIMAL_RADIX } from "@/lib/constants/number.constant.js";
import { PlaceDto } from "@/lib/validation/places/places.schema.js";
import {
    HotelCardDto,
    HotelDetailsDto,
    OfferDto,
} from "@/lib/validation/hotels/hotels.schema.js";
import {
    CancelTimeInput,
    HotelCardsInput,
    Occupancy,
    PrebookSnapshot,
} from "./liteapi.type.js";
import {
    LiteHotelDetails,
    LiteHotelRates,
    LiteHotelSummary,
    LitePlace,
    LitePrebook,
    LiteRate,
} from "@/lib/validation/liteapi/liteapi.schema.js";
import {
    CANCEL_TIME_FORMATS,
    HEX_ENTITY_PREFIX,
    HEX_RADIX,
    HTML_ENTITIES,
    HTTPS_PROTOCOL,
    MAX_CODE_POINT,
    MINUTES_PER_HOUR,
    REFUNDABLE_TAG,
    TIMEZONE_PATTERN,
    UTC_SUFFIX,
} from "./liteapi.constant.js";

const fromCodePoint = (codePoint: number): string | null =>
    Number.isInteger(codePoint) && codePoint > 0 && codePoint <= MAX_CODE_POINT
        ? String.fromCodePoint(codePoint)
        : null;

const decodeEntity = (entity: string): string => {
    const name = entity.slice(1, -1).toLowerCase();

    if (name.startsWith(HEX_ENTITY_PREFIX)) {
        return (
            fromCodePoint(
                parseInt(name.slice(HEX_ENTITY_PREFIX.length), HEX_RADIX)
            ) ?? entity
        );
    }

    if (name.startsWith("#")) {
        return fromCodePoint(parseInt(name.slice(1), DECIMAL_RADIX)) ?? entity;
    }

    return Object.hasOwn(HTML_ENTITIES, name) ? HTML_ENTITIES[name] : entity;
};

/**
 * Turns LiteAPI's HTML descriptions into plain text. Script/style blocks are
 * dropped with their content, block ends become paragraph breaks, entities are
 * decoded. The result is never rendered as HTML by the front.
 */
export const stripHtml = (html: string): string =>
    html
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
        .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6])\s*>/gi, "\n")
        .replace(/<[^>]*>/g, "")
        .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, decodeEntity)
        .replace(/\u00a0/g, " ")
        .split("\n")
        .map((line) => line.replace(/[ \t\r\f\v]+/g, " ").trim())
        .filter((line) => line.length > 0)
        .join("\n\n");

const toHttpsUrl = (url: string | null | undefined): string | null => {
    if (!url) {
        return null;
    }

    try {
        return new URL(url).protocol === HTTPS_PROTOCOL ? url : null;
    } catch {
        return null;
    }
};

const toPositiveOrNull = (value: number | null | undefined): number | null =>
    value !== null && value !== undefined && value > 0 ? value : null;

/**
 * Reads an explicit offset ("GMT", "UTC", "GMT+02:00", "+0530", empty) as
 * minutes east of UTC. Anything else, such as an IANA zone name, gives null:
 * no offset is ever guessed.
 */
const toOffsetMinutes = (
    timezone: string | null | undefined
): number | null => {
    const match = TIMEZONE_PATTERN.exec((timezone ?? "").trim());

    if (!match) {
        return null;
    }

    const [, sign, hours, minutes] = match;

    if (!sign || !hours) {
        return 0;
    }

    const total = Number(hours) * MINUTES_PER_HOUR + Number(minutes ?? 0);

    return sign === "-" ? -total : total;
};

/**
 * LiteAPI sends `cancelTime` as "YYYY-MM-DD HH:mm:ss" with a separate
 * `timezone` ("GMT" in every sandbox sample). The wall time is parsed strictly
 * as UTC, then shifted by the explicit offset. Returns ISO-8601 UTC, or null
 * when either part cannot be read, so a wrong deadline is never shown.
 */
const toUtcInstant = ({
    cancelTime,
    timezone,
}: CancelTimeInput): string | null => {
    const trimmed = cancelTime.trim();
    const isZulu = trimmed.endsWith(UTC_SUFFIX);
    const offsetMinutes = isZulu ? 0 : toOffsetMinutes(timezone);
    const local = isZulu ? trimmed.slice(0, -UTC_SUFFIX.length) : trimmed;

    const wallTime = CANCEL_TIME_FORMATS.map((format) =>
        dayjs.utc(local, format, true)
    ).find((parsed) => parsed.isValid());

    if (offsetMinutes === null || !wallTime) {
        return null;
    }

    return wallTime.subtract(offsetMinutes, "minute").toISOString();
};

const toRateTerms = (
    rate: LiteRate
): Pick<
    OfferDto,
    "roomName" | "boardName" | "refundable" | "cancellationDeadline"
> => {
    const refundable =
        rate.cancellationPolicies.refundableTag === REFUNDABLE_TAG;

    const firstPolicy = rate.cancellationPolicies.cancelPolicyInfos?.[0];

    return {
        roomName: rate.name,
        boardName: rate.boardName,
        refundable,
        cancellationDeadline:
            refundable && firstPolicy ? toUtcInstant(firstPolicy) : null,
    };
};

export const toPlaceDto = (place: LitePlace): PlaceDto => ({
    placeId: place.placeId,
    name: place.displayName,
    address: place.formattedAddress ?? "",
});

/**
 * One offer per roomType: `offerId` and the whole-stay price live on the
 * roomType, room/board/cancellation come from its first rate. Sorted by price.
 */
export const toOffers = (rates: LiteHotelRates): OfferDto[] =>
    rates.roomTypes
        .map((roomType) => ({
            offerId: roomType.offerId,
            price: {
                amount: roomType.offerRetailRate.amount,
                currency: roomType.offerRetailRate.currency,
            },
            ...toRateTerms(roomType.rates[0]),
        }))
        .sort((left, right) => left.price.amount - right.price.amount);

const toHotelAddress = (hotel: LiteHotelSummary): string =>
    [hotel.address, hotel.city]
        .filter((part): part is string => Boolean(part))
        .join(", ");

/**
 * Joins hotels with their rates by hotelId, drops hotels without a matching
 * offer, prices each card with its cheapest offer (the cheapest refundable one
 * when `refundableOnly`), sorts and caps at `limit`.
 */
export const toHotelCards = ({
    hotels,
    rates,
    sort,
    refundableOnly,
    limit,
}: HotelCardsInput): HotelCardDto[] => {
    const offersByHotel = new Map(
        rates.map((hotelRates) => [hotelRates.hotelId, toOffers(hotelRates)])
    );

    const cards = hotels.flatMap((hotel): HotelCardDto[] => {
        const offers = (offersByHotel.get(hotel.id) ?? []).filter(
            (offer) => offer.refundable || !refundableOnly
        );

        const cheapest = offers[0];

        if (!cheapest) {
            return [];
        }

        return [
            {
                hotelId: hotel.id,
                name: hotel.name,
                photoUrl: toHttpsUrl(hotel.main_photo),
                stars: toPositiveOrNull(hotel.stars),
                rating: toPositiveOrNull(hotel.rating),
                reviewCount: hotel.reviewCount ?? null,
                address: toHotelAddress(hotel),
                price: cheapest.price,
                refundable: cheapest.refundable,
            },
        ];
    });

    const sorted = cards.sort((left, right) => {
        const byPrice = left.price.amount - right.price.amount;

        if (sort === "price" || left.rating === right.rating) {
            return byPrice;
        }

        if (left.rating === null) {
            return 1;
        }

        if (right.rating === null) {
            return -1;
        }

        return right.rating - left.rating;
    });

    return sorted.slice(0, limit);
};

const toPhotos = (hotel: LiteHotelDetails): string[] => {
    const images = [...(hotel.hotelImages ?? [])]
        .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
        .map((image) => toHttpsUrl(image.url))
        .filter((url): url is string => url !== null);

    const photos = images.length > 0 ? images : [toHttpsUrl(hotel.main_photo)];

    return [...new Set(photos.filter((url): url is string => url !== null))];
};

export const toHotelDetails = (hotel: LiteHotelDetails): HotelDetailsDto => ({
    hotelId: hotel.id,
    name: hotel.name,
    address: hotel.address ?? "",
    city: hotel.city ?? "",
    country: hotel.country ?? "",
    stars: toPositiveOrNull(hotel.starRating),
    rating: toPositiveOrNull(hotel.rating),
    reviewCount: hotel.reviewCount ?? null,
    description: stripHtml(hotel.hotelDescription ?? ""),
    photos: toPhotos(hotel),
    facilities: [...new Set(hotel.hotelFacilities ?? [])],
    checkinTime:
        hotel.policyAttributes?.checkIn?.from ||
        hotel.checkinCheckoutTimes?.checkin_start ||
        null,
    checkoutTime:
        hotel.policyAttributes?.checkOut?.until ||
        hotel.checkinCheckoutTimes?.checkout ||
        null,
});

export const toPrebookSnapshot = (prebook: LitePrebook): PrebookSnapshot => ({
    ...toRateTerms(prebook.roomTypes[0].rates[0]),
    price: { amount: prebook.price, currency: prebook.currency },
    priceChanged: prebook.priceDifferencePercent !== 0,
});

/**
 * The occupancy LiteAPI priced: adults summed and child ages concatenated
 * across every rate (one rate per room), in response order.
 */
export const toPrebookOccupancy = (prebook: LitePrebook): Occupancy => {
    const rates = prebook.roomTypes.flatMap((roomType) => roomType.rates);

    return {
        adults: rates.reduce((total, rate) => total + rate.adultCount, 0),
        children: rates.flatMap((rate) => rate.childrenAges ?? []),
    };
};
