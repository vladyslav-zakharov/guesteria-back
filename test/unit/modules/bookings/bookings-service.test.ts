import fs from "node:fs";
import path from "node:path";
import { FastifyBaseLogger } from "fastify";
import { mock } from "vitest-mock-extended";
import { describe, expect, it, vi } from "vitest";
import { Prebook, Prisma } from "@prisma/client";
import { LiteApiClient } from "@/lib/liteapi/liteapi.type.js";
import { createService } from "@/modules/bookings/bookings.service.js";
import { RESPONSE_MESSAGES } from "@/lib/messages/messages.constant.js";
import { PrebookRepository } from "@/database/repositories/prebook/prebook.repository.js";
import { BookingRepository } from "@/database/repositories/booking/booking.repository.js";
import {
    BadGatewayError,
    BadRequestError,
    BookingOutcomeUnknownError,
    GatewayTimeoutError,
    NotFoundError,
} from "@/lib/errors/errors.js";
import {
    liteBookingResponseSchema,
    liteHotelDetailsResponseSchema,
    litePrebookResponseSchema,
} from "@/lib/validation/liteapi/liteapi.schema.js";

const fixture = (name: string): unknown =>
    JSON.parse(
        fs.readFileSync(
            path.join(process.cwd(), "test/fixtures/liteapi", `${name}.json`),
            "utf-8"
        )
    );

const litePrebook = litePrebookResponseSchema.parse(fixture("prebook")).data;
const litePrebookWithChild = litePrebookResponseSchema.parse(
    fixture("prebook-with-child")
).data;
const liteBooking = liteBookingResponseSchema.parse(fixture("book")).data;

const liteHotel = liteHotelDetailsResponseSchema.parse(
    fixture("data-hotel")
).data;

const CHILD_AGE = 5;

type RateOccupancy = {
    adultCount: number;
    childCount: number;
    childrenAges?: number[] | null;
};

const withOccupancy = (rates: RateOccupancy[]) => {
    const [roomType] = litePrebook.roomTypes;
    const [rate] = roomType.rates;

    return {
        ...litePrebook,
        roomTypes: [
            {
                ...roomType,
                rates: rates.map((occupancy) => ({ ...rate, ...occupancy })),
            },
        ],
    };
};
const PREBOOK_AMOUNT = 236.89;

const USER_ID = "0f5e2b9a-1c2d-4e3f-8a9b-7c6d5e4f3a21";
const PREBOOK_ID = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a";

const guest = {
    firstName: "Olena",
    lastName: "Kovalenko",
    email: "olena@example.com",
    phone: "+380501112233",
};

const prebookRow: Prebook = {
    id: PREBOOK_ID,
    userId: USER_ID,
    litePrebookId: litePrebook.prebookId,
    offerId: litePrebook.offerId,
    hotelId: litePrebook.hotelId,
    hotelName: "INNSiDE by Meliá Barcelona Apolo",
    roomName: "Double Room",
    boardName: "Room Only",
    checkin: new Date("2026-12-18T00:00:00Z"),
    checkout: new Date("2026-12-20T00:00:00Z"),
    adults: 2,
    childrenAges: [CHILD_AGE],
    amount: new Prisma.Decimal(PREBOOK_AMOUNT),
    currency: "EUR",
    refundable: true,
    cancellationDeadline: new Date("2026-12-16T23:59:59Z"),
    usedAt: null,
    createdAt: new Date("2026-11-18T08:00:00Z"),
};

const bookInput = {
    userId: USER_ID,
    payload: { prebookId: PREBOOK_ID, guest, specialRequests: "Late arrival" },
};

const setup = () => {
    const prebookRepository = mock<PrebookRepository>();
    const bookingRepository = mock<BookingRepository>();
    const client = mock<LiteApiClient>();
    const log = mock<FastifyBaseLogger>();

    client.getHotel.mockResolvedValue(liteHotel);

    return {
        prebookRepository,
        bookingRepository,
        client,
        log,
        service: createService(
            prebookRepository,
            bookingRepository,
            client,
            log
        ),
    };
};

describe("bookingsService.book", () => {
    it("returns 404 for another user's prebook and never calls LiteAPI", async () => {
        const { prebookRepository, client, service } = setup();

        prebookRepository.findOwned.mockRejectedValueOnce(
            new NotFoundError(RESPONSE_MESSAGES.prebook.notFound)
        );

        await expect(service.book(bookInput)).rejects.toMatchObject({
            statusCode: 404,
        });

        expect(prebookRepository.findOwned).toHaveBeenCalledWith({
            id: PREBOOK_ID,
            userId: USER_ID,
        });

        expect(prebookRepository.claimUnused).not.toHaveBeenCalled();
        expect(client.book).not.toHaveBeenCalled();
    });

    it("returns 409 for a used prebook and never calls LiteAPI", async () => {
        const { prebookRepository, client, service } = setup();

        prebookRepository.findOwned.mockResolvedValueOnce({
            ...prebookRow,
            usedAt: new Date("2026-11-18T09:00:00Z"),
        });

        await expect(service.book(bookInput)).rejects.toMatchObject({
            statusCode: 409,
            message: RESPONSE_MESSAGES.booking.prebookUsed,
        });

        expect(prebookRepository.claimUnused).not.toHaveBeenCalled();
        expect(client.book).not.toHaveBeenCalled();
    });

    it("returns 409 when a concurrent submit wins the claim", async () => {
        const { prebookRepository, client, service } = setup();

        prebookRepository.findOwned.mockResolvedValueOnce(prebookRow);
        prebookRepository.claimUnused.mockResolvedValueOnce(false);

        await expect(service.book(bookInput)).rejects.toMatchObject({
            statusCode: 409,
        });

        expect(client.book).not.toHaveBeenCalled();
    });

    it("releases the claim and rethrows when LiteAPI book fails", async () => {
        const { prebookRepository, bookingRepository, client, service } =
            setup();

        const upstreamError = new BadGatewayError(
            RESPONSE_MESSAGES.liteapi.upstream
        );

        prebookRepository.findOwned.mockResolvedValueOnce(prebookRow);
        prebookRepository.claimUnused.mockResolvedValueOnce(true);
        client.book.mockRejectedValueOnce(upstreamError);

        await expect(service.book(bookInput)).rejects.toBe(upstreamError);
        expect(prebookRepository.release).toHaveBeenCalledTimes(1);

        expect(prebookRepository.release).toHaveBeenCalledWith({
            id: PREBOOK_ID,
            userId: USER_ID,
        });

        expect(bookingRepository.create).not.toHaveBeenCalled();
    });

    it("keeps the claim and answers 502 notConfirmed when the book outcome is unknown", async () => {
        const { prebookRepository, bookingRepository, client, log, service } =
            setup();

        prebookRepository.findOwned.mockResolvedValueOnce(prebookRow);
        prebookRepository.claimUnused.mockResolvedValueOnce(true);

        client.book.mockRejectedValueOnce(
            new BookingOutcomeUnknownError(
                RESPONSE_MESSAGES.booking.notConfirmed
            )
        );

        const error = await service.book(bookInput).catch((reason) => reason);

        expect(error).toBeInstanceOf(BadGatewayError);
        expect(error).toMatchObject({
            statusCode: 502,
            message: RESPONSE_MESSAGES.booking.notConfirmed,
        });
        expect(prebookRepository.release).not.toHaveBeenCalled();
        expect(bookingRepository.create).not.toHaveBeenCalled();

        const clientReference = client.book.mock.calls[0][0].clientReference;

        expect(log.error).toHaveBeenCalledWith(
            expect.objectContaining({ prebookId: PREBOOK_ID, clientReference }),
            expect.any(String)
        );
    });

    it("turns a book timeout (504) into 502, releases the claim and logs the references", async () => {
        const { prebookRepository, bookingRepository, client, log, service } =
            setup();

        prebookRepository.findOwned.mockResolvedValueOnce(prebookRow);
        prebookRepository.claimUnused.mockResolvedValueOnce(true);

        client.book.mockRejectedValueOnce(
            new GatewayTimeoutError(RESPONSE_MESSAGES.liteapi.timeout)
        );

        const error = await service.book(bookInput).catch((reason) => reason);

        expect(error).toBeInstanceOf(BadGatewayError);

        expect(error).toMatchObject({
            statusCode: 502,
            message: RESPONSE_MESSAGES.booking.notConfirmed,
        });

        expect(prebookRepository.release).toHaveBeenCalledTimes(1);
        expect(bookingRepository.create).not.toHaveBeenCalled();

        const clientReference = client.book.mock.calls[0][0].clientReference;

        expect(log.error).toHaveBeenCalledWith(
            expect.objectContaining({ prebookId: PREBOOK_ID, clientReference }),
            expect.any(String)
        );
    });

    it("keeps the claim and logs the LiteAPI booking id when storing the confirmed booking fails", async () => {
        const { prebookRepository, bookingRepository, client, log, service } =
            setup();

        const storeError = new Error("database unavailable");

        prebookRepository.findOwned.mockResolvedValueOnce(prebookRow);
        prebookRepository.claimUnused.mockResolvedValueOnce(true);

        client.book.mockImplementationOnce(async (input) => ({
            ...liteBooking,
            clientReference: input.clientReference,
        }));

        bookingRepository.create.mockRejectedValueOnce(storeError);

        await expect(service.book(bookInput)).rejects.toBe(storeError);

        const clientReference = client.book.mock.calls[0][0].clientReference;

        expect(prebookRepository.release).not.toHaveBeenCalled();

        expect(log.error).toHaveBeenCalledWith(
            {
                prebookId: PREBOOK_ID,
                clientReference,
                liteBookingId: liteBooking.bookingId,
            },
            expect.any(String)
        );

        expect(JSON.stringify(vi.mocked(log.error).mock.calls)).not.toContain(
            guest.email
        );
    });

    it("still stores the booking but warns when LiteAPI's status is not CONFIRMED", async () => {
        const { prebookRepository, bookingRepository, client, log, service } =
            setup();

        prebookRepository.findOwned.mockResolvedValueOnce(prebookRow);
        prebookRepository.claimUnused.mockResolvedValueOnce(true);

        client.book.mockImplementationOnce(async () => ({
            ...liteBooking,
            status: "PENDING",
        }));

        bookingRepository.create.mockImplementationOnce(async ({ data }) => ({
            ...prebookRow,
            ...data,
            id: data.id ?? "",
            status: "CONFIRMED",
            hotelPhotoUrl: data.hotelPhotoUrl ?? null,
            amount: prebookRow.amount,
            checkin: prebookRow.checkin,
            checkout: prebookRow.checkout,
            childrenAges: prebookRow.childrenAges,
            cancellationDeadline: prebookRow.cancellationDeadline,
            guestFirstName: guest.firstName,
            guestLastName: guest.lastName,
            guestEmail: guest.email,
            guestPhone: guest.phone,
            specialRequests: null,
            liteBookingId: data.liteBookingId,
            prebookId: data.prebookId,
            createdAt: new Date("2026-11-18T09:00:00Z"),
            updatedAt: new Date("2026-11-18T09:00:00Z"),
        }));

        await service.book(bookInput);

        expect(bookingRepository.create).toHaveBeenCalledTimes(1);
        expect(log.warn).toHaveBeenCalledWith(
            expect.objectContaining({
                prebookId: PREBOOK_ID,
                status: "PENDING",
            }),
            expect.any(String)
        );
    });

    it("stores the booking with id === clientReference, the guest and the prebook snapshot", async () => {
        const { prebookRepository, bookingRepository, client, service } =
            setup();

        prebookRepository.findOwned.mockResolvedValueOnce(prebookRow);
        prebookRepository.claimUnused.mockResolvedValueOnce(true);

        client.book.mockImplementationOnce(async (input) => ({
            ...liteBooking,
            clientReference: input.clientReference,
        }));

        bookingRepository.create.mockImplementationOnce(async ({ data }) => ({
            ...prebookRow,
            ...data,
            id: data.id ?? "",
            status: "CONFIRMED",
            hotelPhotoUrl: data.hotelPhotoUrl ?? null,
            amount: prebookRow.amount,
            checkin: prebookRow.checkin,
            checkout: prebookRow.checkout,
            childrenAges: prebookRow.childrenAges,
            cancellationDeadline: prebookRow.cancellationDeadline,
            guestFirstName: guest.firstName,
            guestLastName: guest.lastName,
            guestEmail: guest.email,
            guestPhone: guest.phone,
            specialRequests: data.specialRequests ?? null,
            liteBookingId: data.liteBookingId,
            prebookId: data.prebookId,
            createdAt: new Date("2026-11-18T09:00:00Z"),
            updatedAt: new Date("2026-11-18T09:00:00Z"),
        }));

        const booking = await service.book(bookInput);

        const bookCall = client.book.mock.calls[0][0];
        const { data } = bookingRepository.create.mock.calls[0][0];

        expect(bookCall).toMatchObject({
            prebookId: litePrebook.prebookId,
            guest,
        });

        expect(data).toMatchObject({
            id: bookCall.clientReference,
            userId: USER_ID,
            prebookId: PREBOOK_ID,
            liteBookingId: liteBooking.bookingId,
            roomName: prebookRow.roomName,
            boardName: prebookRow.boardName,
            adults: prebookRow.adults,
            childrenAges: prebookRow.childrenAges,
            refundable: prebookRow.refundable,
            cancellationDeadline: prebookRow.cancellationDeadline,
            guestFirstName: guest.firstName,
            guestLastName: guest.lastName,
            guestEmail: guest.email,
            guestPhone: guest.phone,
            specialRequests: "Late arrival",
        });

        expect(prebookRepository.release).not.toHaveBeenCalled();

        expect(booking).toMatchObject({
            id: bookCall.clientReference,
            status: "CONFIRMED",
            roomName: "Double Room",
            checkin: "2026-12-18",
            checkout: "2026-12-20",
            nights: 2,
            price: { amount: PREBOOK_AMOUNT, currency: "EUR" },
            cancellationDeadline: "2026-12-16T23:59:59.000Z",
        });

        expect(booking).not.toHaveProperty("liteBookingId");
    });
});

describe("bookingsService.prebook", () => {
    const prebookInput = {
        userId: USER_ID,
        payload: {
            hotelId: litePrebook.hotelId,
            offerId: litePrebook.offerId,
            checkin: litePrebook.checkin,
            checkout: litePrebook.checkout,
            adults: 2,
            children: [],
        },
    };

    it("returns 400 and stores nothing when the response is for another hotel", async () => {
        const { prebookRepository, client, service } = setup();

        client.prebook.mockResolvedValueOnce({
            ...litePrebook,
            hotelId: "lpother1",
        });

        const error = await service
            .prebook(prebookInput)
            .catch((reason) => reason);

        expect(error).toBeInstanceOf(BadRequestError);
        expect(error).toMatchObject({ statusCode: 400 });
        expect(prebookRepository.create).not.toHaveBeenCalled();
    });

    it.each([
        ["check-in", { checkin: "2026-12-19" }],
        ["check-out", { checkout: "2026-12-21" }],
    ])(
        "returns 400 and stores nothing when the response has another %s date",
        async (_label, override) => {
            const { prebookRepository, client, log, service } = setup();

            client.prebook.mockResolvedValueOnce({
                ...litePrebook,
                ...override,
            });

            await expect(service.prebook(prebookInput)).rejects.toMatchObject({
                statusCode: 400,
                message: RESPONSE_MESSAGES.booking.offerMismatch,
            });

            expect(prebookRepository.create).not.toHaveBeenCalled();
            expect(log.warn).toHaveBeenCalledTimes(1);
        }
    );

    it("stores adults and child ages from the response when they match the request", async () => {
        const { prebookRepository, client, service } = setup();

        client.prebook.mockResolvedValueOnce(
            withOccupancy([
                { adultCount: 1, childCount: 1, childrenAges: [9] },
                { adultCount: 1, childCount: 1, childrenAges: [CHILD_AGE] },
            ])
        );

        prebookRepository.create.mockResolvedValueOnce(prebookRow);

        await service.prebook({
            userId: USER_ID,
            payload: { ...prebookInput.payload, children: [CHILD_AGE, 9] },
        });

        const { data } = prebookRepository.create.mock.calls[0][0];

        expect(data).toMatchObject({ adults: 2, childrenAges: [9, CHILD_AGE] });
    });

    it("returns 400, stores nothing and logs no guest data when the adults differ", async () => {
        const { prebookRepository, client, log, service } = setup();

        client.prebook.mockResolvedValueOnce(litePrebook);

        await expect(
            service.prebook({
                userId: USER_ID,
                payload: { ...prebookInput.payload, adults: 4 },
            })
        ).rejects.toMatchObject({
            statusCode: 400,
            message: RESPONSE_MESSAGES.booking.offerMismatch,
        });

        expect(prebookRepository.create).not.toHaveBeenCalled();
        expect(log.warn).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(vi.mocked(log.warn).mock.calls)).not.toContain(
            litePrebook.offerId
        );
    });

    it("accepts the sandbox prebook for 1 adult + 1 child aged 8 and stores its occupancy", async () => {
        const { prebookRepository, client, service } = setup();

        client.prebook.mockResolvedValueOnce(litePrebookWithChild);
        prebookRepository.create.mockResolvedValueOnce(prebookRow);

        await service.prebook({
            userId: USER_ID,
            payload: {
                hotelId: litePrebookWithChild.hotelId,
                offerId: litePrebookWithChild.offerId,
                checkin: litePrebookWithChild.checkin,
                checkout: litePrebookWithChild.checkout,
                adults: 1,
                children: [8],
            },
        });

        const { data } = prebookRepository.create.mock.calls[0][0];

        expect(data).toMatchObject({ adults: 1, childrenAges: [8] });
    });

    it.each([
        ["null", null],
        ["absent", undefined],
    ])(
        "rejects a child booking when the response's childrenAges is %s (fail-closed)",
        async (_label, childrenAges) => {
            const { prebookRepository, client, service } = setup();

            client.prebook.mockResolvedValueOnce(
                withOccupancy([{ adultCount: 2, childCount: 1, childrenAges }])
            );

            await expect(
                service.prebook({
                    userId: USER_ID,
                    payload: { ...prebookInput.payload, children: [CHILD_AGE] },
                })
            ).rejects.toMatchObject({
                statusCode: 400,
                message: RESPONSE_MESSAGES.booking.offerMismatch,
            });

            expect(prebookRepository.create).not.toHaveBeenCalled();
        }
    );

    it("accepts an adults-only booking when the response's childrenAges is null", async () => {
        const { prebookRepository, client, service } = setup();

        client.prebook.mockResolvedValueOnce(
            withOccupancy([
                { adultCount: 2, childCount: 0, childrenAges: null },
            ])
        );
        prebookRepository.create.mockResolvedValueOnce(prebookRow);

        await service.prebook(prebookInput);

        const { data } = prebookRepository.create.mock.calls[0][0];

        expect(data).toMatchObject({ adults: 2, childrenAges: [] });
    });

    it("returns 400 and stores nothing when the child ages differ", async () => {
        const { prebookRepository, client, service } = setup();

        client.prebook.mockResolvedValueOnce(
            withOccupancy([
                { adultCount: 2, childCount: 1, childrenAges: [CHILD_AGE] },
            ])
        );

        await expect(
            service.prebook({
                userId: USER_ID,
                payload: { ...prebookInput.payload, children: [CHILD_AGE + 1] },
            })
        ).rejects.toMatchObject({
            statusCode: 400,
            message: RESPONSE_MESSAGES.booking.offerMismatch,
        });

        expect(prebookRepository.create).not.toHaveBeenCalled();
    });

    it("stores a null deadline and warns for a refundable prebook without a readable cancel time", async () => {
        const { prebookRepository, client, log, service } = setup();
        const [roomType] = litePrebook.roomTypes;
        const [rate] = roomType.rates;

        client.prebook.mockResolvedValueOnce({
            ...litePrebook,
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
        });
        prebookRepository.create.mockResolvedValueOnce(prebookRow);

        await service.prebook(prebookInput);

        const { data } = prebookRepository.create.mock.calls[0][0];

        expect(data).toMatchObject({
            refundable: true,
            cancellationDeadline: null,
        });
        expect(log.warn).toHaveBeenCalledWith(
            { hotelId: litePrebook.hotelId },
            expect.any(String)
        );
    });

    it("stores the response terms and returns our id, never LiteAPI's prebookId", async () => {
        const { prebookRepository, client, service } = setup();

        client.prebook.mockResolvedValueOnce(litePrebook);

        prebookRepository.create.mockImplementationOnce(async () => ({
            ...prebookRow,
            hotelName: liteHotel.name,
        }));

        const prebook = await service.prebook(prebookInput);
        const { data } = prebookRepository.create.mock.calls[0][0];

        expect(data).toMatchObject({
            userId: USER_ID,
            litePrebookId: litePrebook.prebookId,
            hotelId: litePrebook.hotelId,
            hotelName: liteHotel.name,
            amount: litePrebook.price,
            currency: litePrebook.currency,
        });

        expect(prebook).toMatchObject({
            id: PREBOOK_ID,
            hotelName: liteHotel.name,
            nights: 2,
            price: { amount: litePrebook.price, currency: "EUR" },
            priceChanged: false,
        });

        expect(JSON.stringify(prebook)).not.toContain(litePrebook.prebookId);
    });
});
