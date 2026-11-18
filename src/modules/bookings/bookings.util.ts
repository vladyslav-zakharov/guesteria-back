import { Booking } from "@prisma/client";
import { countNights, toStayDate } from "@/lib/dates/dates.js";
import { BookingDto } from "@/lib/validation/bookings/bookings.schema.js";
import { HotelDetailsDto } from "@/lib/validation/hotels/hotels.schema.js";
import { BookingHotelSnapshot, OccupancyComparison } from "./bookings.type.js";

/**
 * Maps a stored booking to the client DTO. Internal ids (`userId`,
 * `prebookId`, `liteBookingId`) never leave the server.
 */
export const toBookingDto = (booking: Booking): BookingDto => {
    const checkin = toStayDate(booking.checkin);
    const checkout = toStayDate(booking.checkout);

    return {
        id: booking.id,
        status: booking.status,
        hotel: {
            hotelId: booking.hotelId,
            name: booking.hotelName,
            photoUrl: booking.hotelPhotoUrl,
            address: booking.hotelAddress,
        },
        roomName: booking.roomName,
        boardName: booking.boardName,
        checkin,
        checkout,
        nights: countNights({ checkin, checkout }),
        adults: booking.adults,
        childrenAges: booking.childrenAges,
        price: {
            amount: booking.amount.toNumber(),
            currency: booking.currency,
        },
        refundable: booking.refundable,
        cancellationDeadline:
            booking.cancellationDeadline?.toISOString() ?? null,
        guest: {
            firstName: booking.guestFirstName,
            lastName: booking.guestLastName,
            email: booking.guestEmail,
            phone: booking.guestPhone,
        },
        specialRequests: booking.specialRequests,
        createdAt: booking.createdAt.toISOString(),
    };
};

/**
 * The hotel facts a booking keeps from `/data/hotel`: the first photo and
 * "<address>, <city>", the same address format as the hotel cards.
 */
export const toBookingHotel = (
    hotel: HotelDetailsDto
): BookingHotelSnapshot => ({
    hotelPhotoUrl: hotel.photos[0] ?? null,
    hotelAddress: [hotel.address, hotel.city]
        .filter((part) => part.length > 0)
        .join(", "),
});

const toSortedAges = (ages: number[]): number[] =>
    [...ages].sort((left, right) => left - right);

/**
 * Same adults and the same child ages, compared as sorted lists so the order
 * LiteAPI lists rooms in does not matter.
 */
export const isSameOccupancy = ({
    requested,
    confirmed,
}: OccupancyComparison): boolean => {
    const requestedAges = toSortedAges(requested.children);
    const confirmedAges = toSortedAges(confirmed.children);

    return (
        requested.adults === confirmed.adults &&
        requestedAges.length === confirmedAges.length &&
        requestedAges.every((age, index) => age === confirmedAges[index])
    );
};
