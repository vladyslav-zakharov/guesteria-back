import { randomUUID } from "node:crypto";
import { FastifyBaseLogger } from "fastify";
import { dayjs } from "@/lib/dates/dayjs.js";
import { addDIResolverName } from "@/lib/awilix/awilix.js";
import { LiteApiClient } from "@/lib/liteapi/liteapi.type.js";
import { CONFIRMED_LITE_STATUS } from "./bookings.constant.js";
import { countNights, fromStayDate } from "@/lib/dates/dates.js";
import { RESPONSE_MESSAGES } from "@/lib/messages/messages.constant.js";
import { LiteBooking } from "@/lib/validation/liteapi/liteapi.schema.js";
import { PrebookRepository } from "@/database/repositories/prebook/prebook.repository.js";
import { BookingRepository } from "@/database/repositories/booking/booking.repository.js";
import {
    isSameOccupancy,
    toBookingDto,
    toBookingHotel,
} from "./bookings.util.js";
import {
    toHotelDetails,
    toPrebookOccupancy,
    toPrebookSnapshot,
} from "@/lib/liteapi/liteapi.mapper.js";
import {
    BookInput,
    BookingDto,
    PrebookDto,
    PrebookInput,
} from "@/lib/validation/bookings/bookings.schema.js";
import {
    BadGatewayError,
    BadRequestError,
    BookingOutcomeUnknownError,
    ConflictError,
    GatewayTimeoutError,
} from "@/lib/errors/errors.js";

export type PrebookPayload = {
    userId: string;
    payload: PrebookInput;
};

export type BookPayload = {
    userId: string;
    payload: BookInput;
};

export type ListBookingsPayload = {
    userId: string;
};

export type GetBookingPayload = {
    userId: string;
    bookingId: string;
};

export type BookingsService = {
    prebook: (payload: PrebookPayload) => Promise<PrebookDto>;
    book: (payload: BookPayload) => Promise<BookingDto>;
    listBookings: (payload: ListBookingsPayload) => Promise<BookingDto[]>;
    getBooking: (payload: GetBookingPayload) => Promise<BookingDto>;
};

export const createService = (
    prebookRepository: PrebookRepository,
    bookingRepository: BookingRepository,
    liteApiClient: LiteApiClient,
    log: FastifyBaseLogger
): BookingsService => ({
    /**
     * The hotel lookup runs first (cached for 1 h, and it 404s an unknown
     * hotel before any prebook). The stored terms, including the occupancy,
     * come from the prebook response, never from the client; a response for
     * another hotel, other dates or another occupancy is rejected and nothing
     * is stored. LiteAPI's prebookId stays in the database only.
     */
    prebook: async ({ userId, payload }) => {
        const { hotelId, offerId, checkin, checkout, adults, children } =
            payload;

        const hotel = await liteApiClient.getHotel(hotelId);
        const litePrebook = await liteApiClient.prebook(offerId);
        const occupancy = toPrebookOccupancy(litePrebook);

        const sameStay =
            litePrebook.hotelId === hotelId &&
            litePrebook.checkin === checkin &&
            litePrebook.checkout === checkout;

        const sameOccupancy = isSameOccupancy({
            requested: { adults, children },
            confirmed: occupancy,
        });

        if (!sameStay || !sameOccupancy) {
            log.warn(
                {
                    userId,
                    hotelId,
                    liteHotelId: litePrebook.hotelId,
                    sameStay,
                    sameOccupancy,
                },
                "Prebook response does not match the request"
            );

            throw new BadRequestError(RESPONSE_MESSAGES.booking.offerMismatch);
        }

        const snapshot = toPrebookSnapshot(litePrebook);

        if (snapshot.refundable && snapshot.cancellationDeadline === null) {
            log.warn(
                { hotelId },
                "Refundable prebook without a readable cancellation deadline"
            );
        }

        const prebook = await prebookRepository.create({
            data: {
                userId,
                litePrebookId: litePrebook.prebookId,
                offerId: litePrebook.offerId,
                hotelId: litePrebook.hotelId,
                hotelName: hotel.name,
                roomName: snapshot.roomName,
                boardName: snapshot.boardName,
                checkin: fromStayDate(litePrebook.checkin),
                checkout: fromStayDate(litePrebook.checkout),
                adults: occupancy.adults,
                childrenAges: occupancy.children,
                amount: snapshot.price.amount,
                currency: snapshot.price.currency,
                refundable: snapshot.refundable,
                cancellationDeadline: snapshot.cancellationDeadline
                    ? dayjs.utc(snapshot.cancellationDeadline).toDate()
                    : null,
            },
        });

        return {
            id: prebook.id,
            hotelName: prebook.hotelName,
            roomName: prebook.roomName,
            boardName: prebook.boardName,
            checkin: litePrebook.checkin,
            checkout: litePrebook.checkout,
            nights: countNights({
                checkin: litePrebook.checkin,
                checkout: litePrebook.checkout,
            }),
            price: snapshot.price,
            priceChanged: snapshot.priceChanged,
            refundable: snapshot.refundable,
            cancellationDeadline: snapshot.cancellationDeadline,
        };
    },

    /**
     * Claim → book → store. The prebook is claimed atomically before LiteAPI
     * is called, so a double submit gets 409. A LiteAPI error that proves
     * nothing was booked releases the claim. A book timeout also releases it
     * but is not treated as a failure upstream: it becomes 502 `notConfirmed`.
     * A 2xx without a readable booking is an unknown outcome: the claim is
     * kept (no retry on this prebook) and the answer is 502 `notConfirmed`.
     * Both log `{ prebookId, clientReference }` for manual reconciliation.
     * `clientReference` is also the booking id.
     */
    book: async ({ userId, payload }) => {
        const { prebookId, guest, specialRequests } = payload;
        const owned = { id: prebookId, userId };

        const prebook = await prebookRepository.findOwned(owned);

        if (prebook.usedAt) {
            throw new ConflictError(RESPONSE_MESSAGES.booking.prebookUsed);
        }

        const hotel = toBookingHotel(
            toHotelDetails(await liteApiClient.getHotel(prebook.hotelId))
        );

        const claimed = await prebookRepository.claimUnused(owned);

        if (!claimed) {
            throw new ConflictError(RESPONSE_MESSAGES.booking.prebookUsed);
        }

        const clientReference = randomUUID();

        let liteBooking: LiteBooking;

        try {
            liteBooking = await liteApiClient.book({
                prebookId: prebook.litePrebookId,
                clientReference,
                guest,
            });
        } catch (error) {
            if (error instanceof BookingOutcomeUnknownError) {
                log.error(
                    { prebookId, clientReference },
                    "LiteAPI book outcome unknown; prebook claim kept for reconciliation"
                );

                throw new BadGatewayError(
                    RESPONSE_MESSAGES.booking.notConfirmed
                );
            }

            try {
                await prebookRepository.release(owned);
            } catch (releaseError) {
                log.error(
                    { prebookId, clientReference, err: releaseError },
                    "Failed to release the prebook claim"
                );
            }

            log.error(
                {
                    prebookId,
                    clientReference,
                    statusCode:
                        error instanceof Error && "statusCode" in error
                            ? error.statusCode
                            : null,
                },
                "LiteAPI book failed; prebook released"
            );

            if (error instanceof GatewayTimeoutError) {
                throw new BadGatewayError(
                    RESPONSE_MESSAGES.booking.notConfirmed
                );
            }

            throw error;
        }

        if (liteBooking.status !== CONFIRMED_LITE_STATUS) {
            log.warn(
                { prebookId, clientReference, status: liteBooking.status },
                "LiteAPI booking status is not CONFIRMED"
            );
        }

        try {
            const booking = await bookingRepository.create({
                data: {
                    id: clientReference,
                    userId,
                    prebookId: prebook.id,
                    liteBookingId: liteBooking.bookingId,
                    hotelId: prebook.hotelId,
                    hotelName: prebook.hotelName,
                    hotelPhotoUrl: hotel.hotelPhotoUrl,
                    hotelAddress: hotel.hotelAddress,
                    roomName: prebook.roomName,
                    boardName: prebook.boardName,
                    checkin: prebook.checkin,
                    checkout: prebook.checkout,
                    adults: prebook.adults,
                    childrenAges: prebook.childrenAges,
                    amount: prebook.amount,
                    currency: prebook.currency,
                    refundable: prebook.refundable,
                    cancellationDeadline: prebook.cancellationDeadline,
                    guestFirstName: guest.firstName,
                    guestLastName: guest.lastName,
                    guestEmail: guest.email,
                    guestPhone: guest.phone,
                    specialRequests,
                },
            });

            return toBookingDto(booking);
        } catch (error) {
            log.error(
                {
                    prebookId,
                    clientReference,
                    liteBookingId: liteBooking.bookingId,
                },
                "Booking confirmed by LiteAPI but not stored"
            );

            throw error;
        }
    },

    listBookings: async ({ userId }) => {
        const bookings = await bookingRepository.listOwned({ userId });

        return bookings.map(toBookingDto);
    },

    getBooking: async ({ userId, bookingId }) => {
        const booking = await bookingRepository.findOwned({
            id: bookingId,
            userId,
        });

        return toBookingDto(booking);
    },
});

addDIResolverName(createService, "bookingsService");
