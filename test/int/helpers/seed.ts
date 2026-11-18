import { randomUUID } from "node:crypto";
import { dayjs } from "@/lib/dates/dayjs.js";
import { fromStayDate } from "@/lib/dates/dates.js";
import { STAY_DATE_FORMAT } from "@/lib/constants/date.constant.js";
import { Booking, ChatMessage, Prebook, PrismaClient } from "@prisma/client";

export type SeededStay = {
    prebook: Prebook;
    booking: Booking;
    messages: ChatMessage[];
};

/**
 * Builds a client for the per-test schema. Call it inside `beforeEach`, after
 * the global setup has rewritten `process.env.DATABASE_URL`.
 */
export const createSeedClient = (): PrismaClient =>
    new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

const STAY_START_OFFSET_DAYS = 30;
const STAY_NIGHTS = 3;

const stayDates = () => {
    const checkin = dayjs
        .utc()
        .startOf("day")
        .add(STAY_START_OFFSET_DAYS, "day");
    const checkout = checkin.add(STAY_NIGHTS, "day");

    return {
        checkin: fromStayDate(checkin.format(STAY_DATE_FORMAT)),
        checkout: fromStayDate(checkout.format(STAY_DATE_FORMAT)),
    };
};

/**
 * Seeds an unused prebook for the user (book-with-prebook target).
 */
export const seedPrebook = async (
    prisma: PrismaClient,
    { userId }: { userId: string }
): Promise<Prebook> =>
    prisma.prebook.create({
        data: {
            userId,
            litePrebookId: `lite-prebook-${randomUUID()}`,
            offerId: `offer-${randomUUID()}`,
            hotelId: "lp1897",
            hotelName: "Seeded Hotel",
            roomName: "Double Room",
            boardName: "Room Only",
            ...stayDates(),
            adults: 2,
            childrenAges: [],
            amount: "236.89",
            currency: "EUR",
            refundable: true,
            cancellationDeadline: dayjs.utc().add(20, "day").toDate(),
        },
    });

/**
 * Seeds a used prebook, the booking built from it and a two-message chat,
 * all owned by `userId`.
 */
export const seedStay = async (
    prisma: PrismaClient,
    { userId }: { userId: string }
): Promise<SeededStay> => {
    const prebook = await prisma.prebook.create({
        data: {
            userId,
            litePrebookId: `lite-prebook-${randomUUID()}`,
            offerId: `offer-${randomUUID()}`,
            hotelId: "lp1897",
            hotelName: "Seeded Hotel",
            roomName: "Double Room",
            boardName: "Room Only",
            ...stayDates(),
            adults: 2,
            childrenAges: [],
            amount: "236.89",
            currency: "EUR",
            refundable: false,
            usedAt: dayjs.utc().toDate(),
        },
    });

    const booking = await prisma.booking.create({
        data: {
            userId,
            prebookId: prebook.id,
            liteBookingId: `lite-booking-${randomUUID()}`,
            hotelId: prebook.hotelId,
            hotelName: prebook.hotelName,
            hotelAddress: "1 Seeded Street",
            roomName: prebook.roomName,
            boardName: prebook.boardName,
            checkin: prebook.checkin,
            checkout: prebook.checkout,
            adults: prebook.adults,
            childrenAges: prebook.childrenAges,
            amount: prebook.amount,
            currency: prebook.currency,
            refundable: prebook.refundable,
            guestFirstName: "Owner",
            guestLastName: "Guest",
            guestEmail: "owner.guest@example.com",
            guestPhone: "+380501234567",
        },
    });

    const askedAt = dayjs.utc().subtract(1, "hour");

    await prisma.chatMessage.createMany({
        data: [
            {
                bookingId: booking.id,
                userId,
                role: "USER",
                content: "What time is check-in?",
                createdAt: askedAt.toDate(),
            },
            {
                bookingId: booking.id,
                userId,
                role: "ASSISTANT",
                content: "Check-in starts at 15:00.",
                createdAt: askedAt.add(1, "second").toDate(),
            },
        ],
    });

    const messages = await prisma.chatMessage.findMany({
        where: { bookingId: booking.id },
        orderBy: { createdAt: "asc" },
    });

    return { prebook, booking, messages };
};
