import { NotFoundError } from "@/lib/errors/errors.js";
import { addDIResolverName } from "@/lib/awilix/awilix.js";
import { Booking, Prisma, PrismaClient } from "@prisma/client";
import { RESPONSE_MESSAGES } from "@/lib/messages/messages.constant.js";
import { BOOKINGS_LIST_LIMIT } from "@/lib/constants/booking.constant.js";

/**
 * Owner-scoped on purpose: there is no method that loads a booking by id alone.
 */
export type BookingRepository = {
    create: (args: {
        data: Prisma.BookingUncheckedCreateInput;
    }) => Promise<Booking>;
    findOwned: (where: { id: string; userId: string }) => Promise<Booking>;
    listOwned: (where: { userId: string }) => Promise<Booking[]>;
};

export const createBookingRepository = (
    prisma: PrismaClient
): BookingRepository => ({
    create: (args) => prisma.booking.create(args),

    findOwned: async ({ id, userId }) => {
        const booking = await prisma.booking.findFirst({
            where: { id, userId },
        });

        if (!booking) {
            throw new NotFoundError(RESPONSE_MESSAGES.booking.notFound);
        }

        return booking;
    },

    listOwned: ({ userId }) =>
        prisma.booking.findMany({
            where: { userId },
            // Newest first so the cap drops the oldest stays, not upcoming trips; the front groups and sorts upcoming/past itself.
            orderBy: { checkin: "desc" },
            take: BOOKINGS_LIST_LIMIT,
        }),
});

addDIResolverName(createBookingRepository, "bookingRepository");
